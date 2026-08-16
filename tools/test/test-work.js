/**
 * 仕事タブ v1.3（Udemy 4視点の強化）のテスト（node tools/test/test-work.js）
 *
 * 確かめること：
 *   ⓪ デルタ（Udemy台帳ログ_YYYY-MM-DD）に「評価」「収益」「施策メモ」の列が
 *      あってもなくても読めるか（無い月でも今までどおり動くか）
 *   ① 取込時の異常が warnings に集まるか。小さな負のデルタ（C04の返金）は「情報」、
 *      大きな逆行・コース名の食い違い・未来日付は「警告」になるか
 *   ② 評価×収益の4象限（⭐改善優先／📣告知不足／🏆看板／🌱育成中）に正しく仕分けられるか
 *   ③ 新作の立ち上がりが「発売からの経過月数」でそろえて過去作平均と比べられるか
 *   ④ 今週（日曜〜土曜）の新規登録トップ3と、前週比±50%以上の急変を拾えるか。施策メモを併記できるか
 *
 * 判定は固定の作り物データで行い、実データ（data.json）は「落ちずに出るか」の素通し確認だけ。
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
const has = (text, word, name) =>
  ok(String(text).indexOf(word) >= 0, name, "この語が無い: " + word + "\n     本文: " + text);

/* ================= Apps Script側 ================= */
const pickGs = (a, b) => {
  const i = gs.indexOf(a), j = gs.indexOf(b);
  if (i < 0 || j < 0) throw new Error("update-data.gs に目印が見つかりません: " + (i < 0 ? a : b));
  return gs.slice(i, j);
};
const Logger = { log: () => {} };
const Utilities = {
  formatDate: (d, tz, fmt) => {
    const p = n => String(n).padStart(2, "0");
    if (fmt === "H:mm") return d.getHours() + ":" + p(d.getMinutes());
    if (fmt === "yyyy/M") return d.getFullYear() + "/" + (d.getMonth() + 1);
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
};
eval(pickGs("var LIMITLESS_FOLDER_ID", "// ===== STEP1"));
eval(pickGs("// ===== Udemy台帳（base + デルタの合算） =====", "// 今公開中の data.json"));
eval(pickGs("// ===== 変換ヘルパー =====", "// ===== GitHub ====="));

/* シートの代わり。2次元配列をそのまま返す */
const sheet = values => ({
  getDataRange: () => ({ getValues: () => values }),
  getParent: () => ({ getSpreadsheetTimeZone: () => "Asia/Tokyo" })
});

console.log("\n⓪ デルタの列が増えても減っても読める");
// これまでの形（評価・収益・施策メモの列が無い）
const oldDelta = readLedgerSheet_(sheet([
  ["記録日", "基準時刻", "コースID", "コース名", "累計登録", "出所"],
  ["2026-09-01", "6:30", "C01", "組織適応の教科書", 400, "スクショ"]
]), "Udemy台帳ログ_2026-09-01");
eq(oldDelta.length, 1, "列が少ないデルタも1行読める");
eq(oldDelta[0].cumEnroll, 400, "累計登録が読める");
eq(oldDelta[0].rating, null, "評価の列が無ければ空のまま（落ちない）");
eq(oldDelta[0].cumRevenue, null, "収益の列が無ければ空のまま");
eq(oldDelta[0].note, null, "施策メモの列が無ければ空のまま");

// 明日以降の形（評価・収益・施策メモの列が増える）
const newDelta = readLedgerSheet_(sheet([
  ["記録日", "基準時刻", "コースID", "コース名", "累計登録", "収益", "評価", "施策メモ", "出所"],
  ["2026-09-02", "6:30", "C01", "組織適応の教科書", 420, "$1,234.50", 4.63, "感謝祭バナー掲出", "スクショ"]
]), "Udemy台帳ログ_2026-09-02");
eq(newDelta[0].cumEnroll, 420, "増えた列があっても累計登録は正しい位置から読む");
eq(newDelta[0].cumRevenue, 1234.5, "「収益」列を読める（$とカンマを外す）");
eq(newDelta[0].rating, 4.63, "「評価」列を読める");
eq(newDelta[0].note, "感謝祭バナー掲出", "「施策メモ」列を読める");

// 「累計収益(USD)」と「収益」が両方あるときは、累計のほうを採る
const bothRev = readLedgerSheet_(sheet([
  ["記録日", "コースID", "累計収益(USD)", "収益"],
  ["2026-09-03", "C01", 9999, 11]
]), "両方ある台帳");
eq(bothRev[0].cumRevenue, 9999, "「累計収益(USD)」が「収益」より優先される");
// 「月間収益(USD)」を累計と取り違えない（v1.1からの決まり）
const monthlyRev = readLedgerSheet_(sheet([
  ["記録日", "コースID", "月間収益(USD)"],
  ["2026-09-04", "C01", 55]
]), "月間しかない台帳");
eq(monthlyRev[0].cumRevenue, null, "「月間収益(USD)」を累計収益と取り違えない");

// 空欄は弱い方（base）で埋め、値があれば強い方（デルタ）が勝つ
const m = mergeLedger_(
  { date: "2026-09-02", id: "C01", cumEnroll: 419, rating: 4.60, note: "先週のメモ", cumRevenue: 1200 },
  { date: "2026-09-02", id: "C01", cumEnroll: 420, rating: null, note: null, cumRevenue: null });
eq(m.cumEnroll, 420, "デルタの値が勝つ");
eq(m.rating, 4.60, "デルタが空欄なら base の評価で埋める");
eq(m.note, "先週のメモ", "施策メモも空欄なら埋める");

console.log("\n① 取込時の異常が warnings に集まる");
const COURSES_G = [
  { id: "C01", short: "組織適応の教科書" }, { id: "C04", short: "リスキリング" },
  { id: "C09", short: "Z世代" }
];
const wrows = [
  { date: "2026-08-01", id: "C01", name: "組織適応の教科書", cumEnroll: 300, cumRevenue: 200 },
  { date: "2026-08-08", id: "C01", name: "組織適応の教科書", cumEnroll: 320, cumRevenue: 210 },
  // C04：返金で3人・$4だけ目減り → 「情報」
  { date: "2026-08-01", id: "C04", name: "リスキリング", cumEnroll: 3980, cumRevenue: 3839.26 },
  { date: "2026-08-08", id: "C04", name: "リスキリング", cumEnroll: 3977, cumRevenue: 3835.20 },
  // C09：500人も減る → 「警告」。さらにコース名が別ものになっている → 「警告」
  { date: "2026-08-01", id: "C09", name: "Z世代", cumEnroll: 14966, cumRevenue: 48683 },
  { date: "2026-08-08", id: "C09", name: "開くリーダー", cumEnroll: 14466, cumRevenue: 48683 }
];
const W = buildWarnings_({ rows: wrows }, COURSES_G, "2026-08-08");
const find = k => W.filter(w => w.kind === k);
eq(find("enrollDrop").filter(w => w.course === "C04")[0].level, "info",
   "★C04の3人減りは「情報」（毎日⚠️を出さない）");
eq(find("revenueDrop").filter(w => w.course === "C04")[0].level, "info", "★C04の$4減りは「情報」");
eq(find("enrollDrop").filter(w => w.course === "C09")[0].level, "warn", "★C09の500人減りは「警告」");
eq(find("nameMismatch").length, 1, "コース名の食い違いを1件見つける");
eq(find("nameMismatch")[0].level, "warn", "コース名の食い違いは「警告」");
has(find("nameMismatch")[0].text, "IDの割当", "コース名の食い違いは何を確かめるべきか書いてある");
eq(W[0].level, "warn", "警告が先頭に並ぶ");
eq(find("stale").length, 0, "最新の記録が基準日と同じなら「止まっている」とは言わない");

// 略称と正式名の違いでは警告を出さない
eq(sameCourseName_("ご機嫌", "【新版】ご機嫌"), true, "片方がもう片方を含むなら同じ講座とみなす");
eq(sameCourseName_("承認パワー", "承認パワー！"), true, "記号の違いだけなら同じ講座とみなす");

/* 2026-08-17に実際に誤検知が7件出たときの本物の名前。
   デルタ（毎日のログ）は同じ講座でも「真ん中を省いた」短い書き方になっている。
   これで警告が出ると、毎日⚠️が7件ついて誰も見なくなる。 */
const REAL_PAIRS = [
  ["C02", "『老害』と呼ばせない！40代・50代から始める 自己アップデート＆セルフモチベーションマネジメント講座",
          "『老害』と呼ばせない！自己アップデート＆セルフモチベーション"],
  ["C03", "年上部下・ベテラン部下が動き出す！年下上司のための信頼関係マネジメント実践講座",
          "年上部下・ベテラン部下が動き出す！年下上司の信頼関係マネジメント"],
  ["C04", "【耳から学ぶビジネストレンド】人生100年時代。リスキリングなくして生き残れない。自ら未来を拓くアップデートの技術。",
          "【耳から学ぶビジネストレンド】リスキリングなくして生き残れない"],
  ["C05", "未来を決めれば人生は変わる。その「決め方」では残念ながら叶いません。\"漢字一文字\"で人生が動き出す！ビジョン実現の技術。",
          "未来を決めれば人生は変わる。ビジョン実現の技術"],
  ["C08", "人生100年時代 経営者・リーダーが不機嫌では困ります『あなたがご機嫌でいるためのルーティン／構築法とセルフコーチング",
          "人生100年時代 ご機嫌でいるためのルーティン構築法とセルフコーチング"],
  ["C09", "部下・新人をいち早く成長させる人材育成法／Ｚ世代が思わず動き出したくなるサクセスパスコーチング『教える技術／育む技術』",
          "部下・新人をいち早く成長させる人材育成法『教える技術／育む技術』"],
  ["C10", "部下と組織の可能性を開くリーダーになる！理論と事例で即実践できるコーチング＆リーダーシップ講座決定版（日本語・英語字幕）",
          "部下と組織の可能性を開くリーダーになる！コーチング＆リーダーシップ講座決定版"]
];
REAL_PAIRS.forEach(p =>
  eq(sameCourseName_(p[1], p[2]), true, "★" + p[0] + ": 真ん中を省いた書き方は同じ講座とみなす"));
const realWarn = buildWarnings_(
  { rows: REAL_PAIRS.flatMap(p => [
      { date: "2026-07-10", id: p[0], name: p[1], cumEnroll: 100 },
      { date: "2026-08-16", id: p[0], name: p[2], cumEnroll: 200 }]) },
  REAL_PAIRS.map(p => ({ id: p[0], short: p[0] })), "2026-08-16");
eq(realWarn.length, 0, "★本物の台帳7コースぶんで、警告が1件も出ない（毎日⚠️が出て麻痺しない）");

// 本当にIDが入れ替わっていれば、今までどおり見つける
eq(sameCourseName_("部下・新人をいち早く成長させる人材育成法／Ｚ世代…",
                   "部下と組織の可能性を開くリーダーになる！理論と事例で…"), false,
   "★C09とC10のように別の講座なら、頭から違うので取り違えとして見つかる");
eq(sameCourseName_("承認パワーで人と組織が元気に動き出す！", "トランジションマネジメント 人生の転機を"), false,
   "★まったく別の講座は同じ名前とみなさない");
eq(sameCourseName_("ご機嫌", "承認パワー"), false, "短い名前どうしでも、違えば違うと分かる");
has(nameForWarn_("【耳から学ぶビジネストレンド】人生100年時代。リスキリングなくして生き残れない。自ら未来を拓く"),
    "人生100年時代", "★警告文には、どこが違うか分かる長さの名前を出す");

// 日付の異常
const W2 = buildWarnings_({ rows: [{ date: "2026-08-01", id: "C01", name: "A", cumEnroll: 10 }] },
                          COURSES_G, "2026-08-13");
eq(find2(W2, "stale")[0].level, "warn", "12日止まっていれば「警告」");
const W3 = buildWarnings_({ rows: [{ date: "2026-08-10", id: "C01", name: "A", cumEnroll: 10 }] },
                          COURSES_G, "2026-08-13");
eq(find2(W3, "stale")[0].level, "info", "3〜6日の遅れは「情報」");
const W3b = buildWarnings_({ rows: [{ date: "2026-08-11", id: "C01", name: "A", cumEnroll: 10 }] },
                           COURSES_G, "2026-08-13");
eq(find2(W3b, "stale").length, 0, "2日の遅れは何も言わない（週末をはさむと普通に起きるため）");
const W4 = buildWarnings_({ rows: [{ date: "2027-01-01", id: "C01", name: "A", cumEnroll: 10 }] },
                          COURSES_G, "2026-08-13");
eq(find2(W4, "futureDate")[0].level, "warn", "未来の日付は「警告」");
const W5 = buildWarnings_({ rows: [
  { date: "2026-08-12", id: "C01", name: "A", cumEnroll: 10 },
  { date: "2026-08-13", id: "C01", name: "A", cumEnroll: 12 }] }, COURSES_G, "2026-08-13");
eq(W5.length, 0, "異常が無ければ warnings は空（⚠️バッジも出ない）");
function find2(list, k) { return list.filter(w => w.kind === k); }

console.log("\n（発売月）base の公開年月が無いコースは、台帳の初出月を発売月とみなす");
const built = buildUdemy_({
  rows: [
    { date: "2026-03-10", id: "C01", cumEnroll: 10 },
    { date: "2026-04-10", id: "C01", cumEnroll: 50 },
    { date: "2026-04-10", id: "C02", cumEnroll: 900 }
  ],
  courses: [{ id: "C01", short: "新作", published: null }, { id: "C02", short: "古参", published: "2024/1" }],
  used: []
}, null);
eq(built.courses.filter(c => c.id === "C01")[0].firstYm, "2026-03", "公開年月が無ければ初出月が入る");
eq(built.courses.filter(c => c.id === "C02")[0].published, "2024/1", "公開年月があればそのまま");

/* ================= アプリ側（index.html） ================= */
const pickHtml = (a, b) => {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0) throw new Error("index.html に目印が見つかりません: " + (i < 0 ? a : b));
  return html.slice(i, j);
};
const leak = code => code.replace(/^(const|let) /gm, "var ");
eval(leak(pickHtml("/* ===== util ===== */", "/* ===== state ===== */")));
eval(leak(pickHtml("/* ===== 分析メモ（4視点）ここから =====", "/* ===== 分析メモ ここまで ===== */")));
eval(leak(pickHtml("/* ===== 知識の部屋（リミットレス台帳の集計）ここから =====",
                   "/* ===== 知識の部屋 ここまで ===== */")));
eval(leak(pickHtml("/* ===== 仕事タブ v1.3", "/* ===== 仕事タブ v1.3 ここまで ===== */")));

console.log("\n① ⚠️バッジ（data.jsonのwarningsをそのまま使う）");
const w1 = wkWarnings({ warnings: [
  { level: "warn", text: "大きな逆行" }, { level: "info", text: "小さな返金" }] });
eq(w1.warn.length + "/" + w1.info.length, "1/1", "警告と情報を分ける");
eq(w1.level, "warn", "警告が1件でもあれば全体は警告");
eq(wkWarnings({ warnings: [{ level: "info", text: "返金" }] }).level, "info", "情報だけなら情報");
eq(wkWarnings({ warnings: [] }).level, null, "何も無ければバッジを出さない");
eq(wkWarnings({ udemy: [], udemyCourses: [] }).all.length, 0,
   "warningsが無い古いdata.jsonでも落ちない");

console.log("\n② 評価×収益の4象限");
/* 作り物：発売から12ヶ月そろえて、収益と評価だけを動かす */
const q10 = { generatedAt: "2026-08-13T07:00:00+09:00",
  udemyCourses: [
    { id: "A1", short: "看板",   published: "2025/8" },
    { id: "A2", short: "看板2",  published: "2025/8" },
    { id: "B1", short: "改善",   published: "2025/8" },
    { id: "B2", short: "改善2",  published: "2025/8" },
    { id: "C1", short: "告知",   published: "2025/8" },
    { id: "D1", short: "育成",   published: "2025/8" }
  ],
  udemy: [{ date: "2026-08-13", rows: [
    { id: "A1", rating: 4.5, cumEnroll: 6000, cumRevenue: 12000 },   // 評価高×収益高
    { id: "A2", rating: 4.4, cumEnroll: 5500, cumRevenue: 11000 },   // 評価高×収益高
    { id: "B1", rating: 3.6, cumEnroll: 5800, cumRevenue: 13000 },   // 評価低×収益高
    { id: "B2", rating: 3.7, cumEnroll: 5200, cumRevenue: 10500 },   // 評価低×収益高
    { id: "C1", rating: 4.6, cumEnroll: 500,  cumRevenue: 900 },     // 評価高×収益低
    { id: "D1", rating: 3.5, cumEnroll: 400,  cumRevenue: 800 }      // 評価低×収益低
  ] }] };
const Q = wkQuadrant(q10);
const qOf = id => Q.items.filter(x => x.id === id)[0].q;
eq(Q.ok, true, "6コースそろっていれば仕分けできる");
eq(qOf("A1"), "ace", "★評価も収益も高い → 🏆看板");
eq(qOf("B1"), "fix", "★収益は高いのに評価が低い → ⭐改善優先");
eq(qOf("C1"), "pr", "★評価は高いのに収益（＝登録）が少ない → 📣告知不足");
eq(qOf("D1"), "grow", "★どちらもこれから → 🌱育成中");
// 発売からの月数でそろえる（古い講座が自動的に上に行かない）
const qAge = wkQuadrant({ generatedAt: "2026-08-13T07:00:00+09:00",
  udemyCourses: [
    { id: "OLD", short: "5年前の講座", published: "2021/8" },
    { id: "NEW", short: "半年前の講座", published: "2026/2" },
    { id: "X1", short: "並1", published: "2024/8" },
    { id: "X2", short: "並2", published: "2024/8" }],
  udemy: [{ date: "2026-08-13", rows: [
    { id: "OLD", rating: 4.0, cumEnroll: 10000, cumRevenue: 12000 },  // 60ヶ月 → 月$200
    { id: "NEW", rating: 4.5, cumEnroll: 1200,  cumRevenue: 3600 },   // 7ヶ月 → 月$514
    { id: "X1",  rating: 3.9, cumEnroll: 2000,  cumRevenue: 2400 },   // 25ヶ月 → 月$96
    { id: "X2",  rating: 4.4, cumEnroll: 2100,  cumRevenue: 2500 }] }] });
eq(qAge.items.filter(x => x.id === "NEW")[0].q, "ace",
   "★累計は少なくても、月あたりで見れば新作が🏆看板になりうる");
// 評価か収益が入っていないうちは「データ待ち」
const qWait = wkQuadrant({ generatedAt: "2026-08-13T07:00:00+09:00",
  udemyCourses: [{ id: "A1", published: "2025/8" }, { id: "A2", published: "2025/8" }],
  udemy: [{ date: "2026-08-13", rows: [
    { id: "A1", rating: null, cumEnroll: 100, cumRevenue: null },
    { id: "A2", rating: null, cumEnroll: 200, cumRevenue: null }] }] });
eq(qWait.ok, false, "評価・収益が未着なら仕分けない");
eq(qWait.items[0].q, "wait", "★未着のコースは「データ待ち」");
has(qWait.reason, "データ待ち".slice(0, 0) + "4件", "何件そろえば始まるか書いてある");

console.log("\n③ 新作の立ち上がり（発売からの経過月数でそろえる）");
const monthly = [];
const push = (ym, obj) => monthly.push({ ym: ym, byCourse: obj });
/* 過去作 P1〜P3 は 2024-01 発売で 1ヶ月目100→2ヶ月目200→3ヶ月目300 前後。
   新作 N1 は 2026-06 発売で 1ヶ月目150→2ヶ月目300→3ヶ月目450（過去作の1.5倍） */
["2024-01", "2024-02", "2024-03"].forEach((ym, i) => {
  push(ym, { P1: { enroll: 100 * (i + 1) }, P2: { enroll: 90 * (i + 1) }, P3: { enroll: 110 * (i + 1) } });
});
push("2026-06", { N1: { enroll: 150 }, P1: { enroll: 9999 }, P2: { enroll: 9999 }, P3: { enroll: 9999 } });
push("2026-07", { N1: { enroll: 300 }, P1: { enroll: 9999 }, P2: { enroll: 9999 }, P3: { enroll: 9999 } });
push("2026-08", { N1: { enroll: 450 }, P1: { enroll: 9999 }, P2: { enroll: 9999 }, P3: { enroll: 9999 } });
const LD = { generatedAt: "2026-08-13T07:00:00+09:00", udemyMonthly: monthly,
  udemyCourses: [
    { id: "N1", short: "新作", published: "2026/6" },
    { id: "P1", short: "過去1", published: "2024/1" },
    { id: "P2", short: "過去2", published: "2024/1" },
    { id: "P3", short: "過去3", published: "2024/1" }] };
const L = wkLaunch(LD);
eq(L.ok, true, "新作と過去作3作がそろえば比べられる");
eq(L.items.length, 1, "直近12ヶ月の新作だけを取り上げる");
eq(L.items[0].id, "N1", "新作はN1");
eq(L.items[0].months, 3, "いまは3ヶ月目");
eq(L.items[0].points.map(p => p.k).join(","), "1,2,3", "1ヶ月目から順に並ぶ");
eq(Math.round(L.items[0].points[0].avg), 100, "★1ヶ月目の過去作平均は(100+90+110)/3=100");
eq(Math.round(L.items[0].points[2].avg), 300, "★3ヶ月目の過去作平均は300（同じ月齢どうしで比べている）");
eq(Math.round(L.items[0].ratio * 100), 150, "★新作は過去作平均の150%");
eq(L.items[0].partial, true, "今月ぶんは「途中」と分かるようにする");
eq(wkLaunch({ generatedAt: "2026-08-13T07:00:00+09:00", udemyMonthly: monthly,
  udemyCourses: [{ id: "P1", published: "2024/1" }, { id: "P2", published: "2024/1" },
                 { id: "P3", published: "2024/1" }, { id: "P4", published: "2024/1" }] }).ok, false,
  "直近12ヶ月に新作が無ければ出さない");
// 発売月が空でも、台帳の初出月（firstYm）があれば比べられる
const LD2 = JSON.parse(JSON.stringify(LD));
LD2.udemyCourses[0] = { id: "N1", short: "新作", published: null, firstYm: "2026-06" };
eq(wkLaunch(LD2).items[0].months, 3, "★公開年月が無いコースは台帳の初出月を発売月として使う");

console.log("\n④ 今週の変化点（日曜〜土曜／前週比±50%）");
/* 基準日 2026-08-13(木) → 今週は 8/9(日)〜8/15(土)。
   今週の起点＝8/8以前の最後の記録、前週の起点＝8/1以前の最後の記録 */
const CH = { generatedAt: "2026-08-13T07:00:00+09:00",
  udemyCourses: [{ id: "C1", short: "急増" }, { id: "C2", short: "普通" },
                 { id: "C3", short: "急減" }, { id: "C4", short: "小口" }],
  udemy: [
    { date: "2026-08-01", rows: [{ id: "C1", cumEnroll: 1000 }, { id: "C2", cumEnroll: 2000 },
                                 { id: "C3", cumEnroll: 3000 }, { id: "C4", cumEnroll: 40 }] },
    { date: "2026-08-08", rows: [{ id: "C1", cumEnroll: 1020 }, { id: "C2", cumEnroll: 2100 },
                                 { id: "C3", cumEnroll: 3200 }, { id: "C4", cumEnroll: 44 }] },
    { date: "2026-08-13", rows: [
        { id: "C1", cumEnroll: 1120, note: "感謝祭バナー掲出" },   // 前週+20 → 今週+100（+400%）
        { id: "C2", cumEnroll: 2200 },                             // 前週+100 → 今週+100（変わらず）
        { id: "C3", cumEnroll: 3250 },                             // 前週+200 → 今週+50（−75%）
        { id: "C4", cumEnroll: 50 }] }                             // 前週+4 → 今週+6（人数が小さいので急変にしない）
  ] };
const C = wkChanges(CH);
eq(C.ok, true, "今週の記録があれば出せる");
eq(C.week.from + "〜" + C.week.to, "2026-08-09〜2026-08-15", "今週の窓は日曜〜土曜");
eq(C.from + "→" + C.to, "2026-08-08→2026-08-13", "実際に測った区間（起点は先週の最後の記録）");
eq(C.top.map(x => x.id).join(","), "C1,C2,C3", "★新規登録トップ3");
eq(C.top[0].cur, 100, "1位の増分");
eq(C.total, 256, "今週の合計（100+100+50+6）");
eq(C.rows.filter(x => x.id === "C1")[0].prev, 20, "前週の増分も出す");
ok(!!C.rows.filter(x => x.id === "C1")[0].spike, "★+400%は急変として拾う");
ok(!!C.rows.filter(x => x.id === "C3")[0].spike, "★−75%も急変として拾う");
ok(!C.rows.filter(x => x.id === "C2")[0].spike, "±50%未満は急変にしない");
ok(!C.rows.filter(x => x.id === "C4")[0].spike, "★数人のブレ（4人→6人）は急変にしない");
eq(C.spikes.map(x => x.id).join(","), "", "トップ3に入っているコースは急変リストで重複させない");
eq(C.rows.filter(x => x.id === "C1")[0].notes.join(""), "感謝祭バナー掲出",
   "★施策メモがあれば併記できる");
eq(C.rows.filter(x => x.id === "C2")[0].notes.length, 0, "施策メモが無い週は空のまま（落ちない）");
eq(C.curDays + "/" + C.prevDays, "5/7", "今週ぶんと前週ぶんの日数を持っている");

/* 日曜の朝は「今週」がまだ1日ぶん。前週（1週間ぶん）とそのまま比べると
   全コースが「−95%の急変」になってしまうので、そのうちは前週比を出さない。 */
const CH3 = { generatedAt: "2026-08-16T08:00:00+09:00",     // 8/16は日曜
  udemyCourses: [{ id: "C1", short: "A" }],
  udemy: [
    { date: "2026-08-01", rows: [{ id: "C1", cumEnroll: 1000 }] },
    { date: "2026-08-15", rows: [{ id: "C1", cumEnroll: 1164 }] },   // 前週 +164人（14日）
    { date: "2026-08-16", rows: [{ id: "C1", cumEnroll: 1170 }] }    // 今週 +6人（1日）
  ] };
const C3 = wkChanges(CH3);
eq(C3.week.from + "〜" + C3.week.to, "2026-08-16〜2026-08-22", "日曜はその日が週の初日");
eq(C3.curDays, 1, "今週はまだ1日ぶん");
eq(C3.rows[0].cur + "/" + C3.rows[0].prev, "6/164", "増分そのものは出す");
eq(C3.rows[0].spike, null, "★週が始まったばかりのうちは「急変」と言わない");
/* 週の後半なら、日数をそろえて比べる。基準日 8/20（木）→ 今週は 8/16〜8/22。
   今週 8/15→8/20（5日）、前週 8/1→8/15（14日）＝1日あたり150/14≒10.7人。
   C1 は5日で+107人（1日21.4人）＝前週の約2倍 → 急変。
   C2 は5日で+54人（1日10.8人）＝前週とほぼ同じ。人数だけ見ると150→54で−64%だが急変ではない。 */
const CH4 = { generatedAt: "2026-08-20T08:00:00+09:00",
  udemyCourses: [{ id: "C1", short: "A" }, { id: "C2", short: "B" }],
  udemy: [
    { date: "2026-08-01", rows: [{ id: "C1", cumEnroll: 1000 }, { id: "C2", cumEnroll: 5000 }] },
    { date: "2026-08-15", rows: [{ id: "C1", cumEnroll: 1150 }, { id: "C2", cumEnroll: 5150 }] },
    { date: "2026-08-20", rows: [{ id: "C1", cumEnroll: 1257 }, { id: "C2", cumEnroll: 5204 }] }
  ] };
const C4 = wkChanges(CH4);
eq(C4.curDays + "/" + C4.prevDays, "5/14", "測った日数を両方持っている");
eq(Math.round(C4.rows.filter(x => x.id === "C1")[0].spike.ratio * 100), 100,
   "★1日あたりにそろえて前週比を出す（1日21.4人 対 1日10.7人＝+100%）");
eq(C4.rows.filter(x => x.id === "C2")[0].spike, null,
   "★人数だけ見ると前週−64%でも、1日あたりならほぼ同じなので急変にしない");

/* 前週の起点が今週の起点と同じ記録しか無いとき（記録が週1回より粗い時期）。
   このとき前週の増分は必ず0になるので、「全コースが急変」にならないようにする。 */
const CH2 = { generatedAt: "2026-08-13T07:00:00+09:00",
  udemyCourses: [{ id: "C1", short: "A" }, { id: "C2", short: "B" }],
  udemy: [
    { date: "2026-08-01", rows: [{ id: "C1", cumEnroll: 1000 }, { id: "C2", cumEnroll: 2000 }] },
    { date: "2026-08-13", rows: [{ id: "C1", cumEnroll: 1141 }, { id: "C2", cumEnroll: 2120 }] }
  ] };
const C2 = wkChanges(CH2);
eq(C2.ok, true, "記録が粗くてもトップ3は出す");
eq(C2.canPrev, false, "★前週にあたる記録が無いことが分かる");
eq(C2.rows.filter(x => x.id === "C1")[0].prev, null, "★前週の増分は「0」ではなく「無い」にする");
eq(C2.rows.filter(x => x.spike).length, 0, "★全コースが「急変」になってしまわない");
eq(C2.top[0].id, "C1", "それでも増分トップは出せる");

// 今週まだ記録が無い / 先週までの記録が無い
eq(wkChanges({ generatedAt: "2026-08-13T07:00:00+09:00",
  udemy: [{ date: "2026-08-01", rows: [{ id: "C1", cumEnroll: 1 }] }] }).ok, false,
  "今週の記録が無ければ「まだ出せない」と返す");
eq(wkChanges({ generatedAt: "2026-08-13T07:00:00+09:00",
  udemy: [{ date: "2026-08-13", rows: [{ id: "C1", cumEnroll: 1 }] }] }).ok, false,
  "先週までの記録が無ければ比べない");

console.log("\n【実データ】data.json を素通しして落ちないか");
const real = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));
const rw = wkWarnings(real), rq = wkQuadrant(real), rl = wkLaunch(real), rc = wkChanges(real);
console.log("   ⚠️ 警告" + rw.warn.length + "件 / 情報" + rw.info.length + "件");
console.log("   4象限: " + (rq.ok
  ? rq.items.map(x => x.id + WK_QUAD[x.q].label).join(" ")
  : "データ待ち（" + rq.reason + "）"));
console.log("   新作: " + (rl.ok
  ? rl.items.map(x => x.id + " " + x.months + "ヶ月目 " + Math.round(x.ratio * 100) + "%").join(" / ")
  : rl.reason));
console.log("   今週の変化点: " + (rc.ok
  ? rc.week.from + "〜" + rc.week.to + " 計" + rc.total + "人／トップ " +
    rc.top.map(x => x.id + (x.cur >= 0 ? "+" : "") + x.cur).join(" ")
  : rc.reason));
ok(true, "実データで4つとも例外なく動く");

console.log(fail ? "\n❌ " + fail + "件 失敗\n" : "\n全ケース合格 ✅\n");
process.exit(fail ? 1 : 0);
