/**
 * v1.4 目標×差分・3点セット・週報書棚・ver57.x のテスト（node tools/test/test-want.js）
 *
 * 確かめること：
 *   ①【PART A・差分計算の3パターン】
 *      ・自動      … 現状を機械算出して 目標−現状＝差分 を出す
 *      ・手動/半自動 … 目標と備考だけ。差分は出さない（＝出さないことを確かめる）
 *      ・幅つき目標 … 「78kg(理想)〜72kg(本音)」は、いまの数字に近い方を基準にする
 *                     （83.7kgなら78基準。幅の中に入っていれば達成）
 *   ② 仕分けのキーが「項目名」ではなく「現状の取り方」の文になっているか
 *      （項目名を変えても壊れない／台帳に行が増えてもコードを直さずに拾われる）
 *   ③ 自動なのに対応が無い行・目標値が数字でない行でも落ちないか（＝空欄になるだけ）
 *   ④ ver57.x が Apps Script側とアプリ側で同じ数になるか
 *   ⑤ 総資産の推移（記録日ごとの残高。資産クラスの行があればそれだけを足す）
 *   ⑥ 3点セット（最新レコード／書棚のリンク／全期間）と、週報書棚のリンク
 *   ⑦ want が無い古い data.json（＝いま公開中のもの）でも落ちないか
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
const CONFIG = { birthDate: "1969-04-30" };
eval(pickGs("function ecoHistory_(all) {", "// ===== v1.4: WANT台帳"));
eval(pickGs("// ===== v1.4: 自己バージョン", "// ===== 変換ヘルパー"));

console.log("\n【Apps Script側】自己バージョン ver57.x");
eq(selfVersion_("2026-08-17").version, "ver57.04", "★2026年8月は ver57.04（1969-04-30生まれ）");
eq(selfVersion_("2026-04-01").version, "ver57.00", "誕生月は .00（日にちは見ない）");
eq(selfVersion_("2026-03-31").version, "ver56.11", "誕生月の前月は .11");
eq(selfVersion_("2027-04-30").version, "ver58.00", "1年進むと整数部が1つ上がる");
eq(selfVersion_("1969-04-30").version, "ver0.00", "生まれた月は ver0.00");
eq(selfVersion_("1960-01-01").version, "ver0.00", "生まれる前の日付でも負にならない");

console.log("\n【Apps Script側】総資産の推移（記録日ごと）");
const ECO_ALL = [
  // 8/15：総括・資産クラス・個別の3段。資産クラスの2行だけを足して 300万
  { date: "2026-08-15", name: "総資産", level: "total", amount: 9999999 },
  { date: "2026-08-15", name: "米国株式", level: "class", amount: 2000000 },
  { date: "2026-08-15", name: "外貨建債券", level: "class", amount: 1000000 },
  { date: "2026-08-15", name: "MQ354", level: "item", amount: 500000 },
  { date: "2026-08-15", name: "参考為替", level: "memo", amount: 147 },
  // 8/16：資産クラスの行が無い旧い書き方。総括とメモ以外を足して 80万
  { date: "2026-08-16", name: "SBI証券", level: "item", amount: 500000 },
  { date: "2026-08-16", name: "楽天銀行", level: "item", amount: 300000 },
  { date: "2026-08-16", name: "総資産", level: "total", amount: 8888888 }
];
const hist = ecoHistory_(ECO_ALL);
eq(hist.length, 2, "記録日の数だけ点ができる");
eq(hist[0].date + ":" + hist[0].total, "2026-08-15:3000000", "★資産クラスがあればそれだけを足す（3重計上しない）");
eq(hist[0].level, "class", "その日の合算の段は class");
eq(hist[1].date + ":" + hist[1].total, "2026-08-16:800000", "資産クラスが無い日は総括とメモ以外を足す");
eq(ecoHistory_([]).length, 0, "1件も無ければ空（落ちない）");

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
eval(leak(pickHtml("/* ===== v1.4 目標×差分（WANT台帳）ここから =====", "/* ===== v1.4 目標×差分 ここまで ===== */")));
eval(leak(pickHtml("/* ===== v1.4 3点セット（📖最新を読む／🗄書棚／📊全期間）ここから =====",
                   "/* ===== v1.4 3点セット ここまで ===== */")));

console.log("\n【アプリ側】ver57.x が Apps Script側と一致する");
["2026-08-17", "2026-04-01", "2026-03-31", "2027-04-30", "1969-04-30"].forEach(d => {
  eq(selfVersion(d).version, selfVersion_(d).version, "★" + d + " の ver が両側で一致");
});

console.log("\n【アプリ側】「現状の取り方」から自動／半自動／手動を見分ける");
eq(wtMode("自動: health直近のweight"), "auto", "「自動:」で始まれば自動");
eq(wtMode("半自動: Udemy収益は自動・他は経済台帳"), "semi", "★「半自動」を「自動」と取り違えない");
eq(wtMode("手動: 大会エントリー実績"), "manual", "「手動:」は手動");
eq(wtMode("　自動：exerciseログ"), "auto", "行頭の空白や全角コロンでも自動と読む");
eq(wtMode(null), "manual", "空欄は手動に倒す（勝手に差分を出さない）");
eq(wtMode("週報で確認"), "manual", "知らない書き方も手動に倒す");

console.log("\n【アプリ側】仕分けのキーは項目名ではなく「現状の取り方」の文");
eq(wtMetric("自動: health直近のweight"), "weight", "体重");
eq(wtMetric("自動: udemyCoursesの本数"), "courses", "Udemyコース数");
eq(wtMetric("自動: リミットレス🗣️教えカウント"), "teach", "教えカウント");
eq(wtMetric("自動: 経済台帳の総資産推移"), "ecoTotal", "総資産");
eq(wtMetric("自動: exerciseログ"), null, "★まだ対応の無い自動行は null（差分を出さない）");
eq(wtMetric("手動: 週報で確認"), null, "手動の文はどれにも当たらない");

console.log("\n【アプリ側】目標値の読み取り");
const g1 = wtGoal("78kg(理想)〜72kg(本音)");
eq(JSON.stringify(g1.values) + "/" + g1.unit, "[78,72]/kg", "★かっこ書きを外して幅つき目標を読む");
const g2 = wtGoal("3〜5km/日");
eq(JSON.stringify(g2.values) + "/" + g2.unit, "[3,5]/km/日", "幅つき目標（単位つき）");
const g3 = wtGoal("100本");
eq(JSON.stringify(g3.values) + "/" + g3.unit, "[100]/本", "1点の目標");
eq(wtGoal("(目標額は次回セッションで設定)").ok, "false", "★中身がかっこ書きだけなら数字なし＝差分を出さない");
eq(wtGoal("(基準値は週報数週分の実測後に設定)").ok, "false", "基準値未設定も同じ");
eq(wtGoal("現役続行").ok, "false", "言葉だけの目標は数字なし");
eq(wtGoal("").ok, "false", "空欄でも落ちない");
eq(wtGoal(null).ok, "false", "null でも落ちない");

console.log("\n【アプリ側】差分＝目標−現状（幅つきは近い方が基準）");
eq(wtDiff(wtGoal("100本"), 10).diff, 90, "1点の目標: 100−10＝+90");
const dw = wtDiff(wtGoal("78kg(理想)〜72kg(本音)"), 83.7);
eq(dw.base, 78, "★83.7kgなら近い方の78が基準（72ではない）");
eq(dw.diff.toFixed(1), "-5.7", "★差分は 78−83.7＝−5.7kg");
eq(dw.done, "false", "幅の外なので未達成");
const dw2 = wtDiff(wtGoal("78kg(理想)〜72kg(本音)"), 74.0);
eq(dw2.done + "/" + dw2.diff, "true/0", "★幅（72〜78）の中に入っていれば達成・差分0");
const dw3 = wtDiff(wtGoal("78kg(理想)〜72kg(本音)"), 71.0);
eq(dw3.base, 72, "幅より下なら、近い方の72が基準");
eq(dw3.diff, 1, "72−71＝+1");
eq(wtDiff(wtGoal("現役続行"), 5), null, "数字でない目標では差分を出さない");
eq(wtDiff(wtGoal("100本"), null), null, "現状が取れなければ差分を出さない");

/* ---- 作り物のdata.json（WANT台帳の3パターンをそのまま入れる） ---- */
const D = {
  generatedAt: "2026-08-17T08:00:00+09:00",
  version: "1.4",
  selfVersion: { birth: "1969-04-30", version: "ver57.04" },
  monthlyReview: [],
  health: [
    { date: "2026-08-15", dow: "土", weight: 84.2, sleep: 71, mood: 8, exercise: "茶臼岳登山", dining: null, note: "登頂" },
    { date: "2026-08-16", dow: "日", weight: 83.7, sleep: 68, mood: 7, exercise: null, dining: "家族と焼肉", note: "アキさんと" }
  ],
  udemyCourses: [{ id: "C01", short: "組織適応" }, { id: "C02", short: "老害" }],
  udemy: [{ date: "2026-08-16", time: "6:30",
            rows: [{ id: "C01", cumEnroll: 4000, cumRevenue: 900.5, rating: 4.5 },
                   { id: "C02", cumEnroll: 1000, cumRevenue: 100.25, rating: 4.2 }] }],
  udemyMonthly: [],
  limitless: { rows: [
    { date: "2026-08-16", kinds: ["教え"], kindsText: "🗣️教え", text: "大崎君にコーチング", who: "大崎君", src: "リミットレス台帳ログ_2026-08-16" }] },
  knowledge: { asOf: "2026-08-17", kinds: ["教え"],
    week:  { from: "2026-08-16", to: "2026-08-22", rows: 1, counts: { 教え: 1 } },
    month: { from: "2026-08-01", to: "2026-08-31", rows: 9, counts: { 教え: 9 } },
    recent: [], total: 9, folderUrl: "https://drive.google.com/drive/folders/1UAbime" },
  eco: { asOf: "2026-08-16", total: 13704370, sumLevel: "class",
         rows: [{ date: "2026-08-16", name: "米国株式", level: "class", amount: 13704370 }],
         history: [{ date: "2026-08-15", total: 13000000, level: "class", rows: 4 },
                   { date: "2026-08-16", total: 13704370, level: "class", rows: 4 }] },
  weekly: { folderId: "1sV", folderUrl: "https://drive.google.com/drive/folders/1sV", count: 2,
            latest: { name: "週報_2026-08-16.gdoc", url: "https://docs.google.com/document/d/xxx",
                      modified: "2026-08-16 21:30" } },
  links: { folders: { health: "https://drive.google.com/drive/folders/GOK",
                      work: "https://drive.google.com/drive/folders/UDE",
                      know: "https://drive.google.com/drive/folders/LIM",
                      spirit: "https://drive.google.com/drive/folders/LIM",
                      eco: "https://drive.google.com/drive/folders/ECO",
                      priv: "https://drive.google.com/drive/folders/GOK" } },
  want: {
    fileId: "1UgAb", fileUrl: "https://docs.google.com/spreadsheets/d/1UgAb",
    title: "WANT台帳（目標×差分の目標側）", asOf: "2026-08-17 00:37",
    rows: [
      // ① 自動 × 幅つき目標
      { room: "健康", item: "体重", goal: "78kg(理想)〜72kg(本音)", due: "巡航目標",
        how: "自動: health直近のweight", note: "体重減より筋肉量増を優先" },
      // ② 自動 × 1点の目標
      { room: "仕事", item: "Udemyコース数", goal: "100本", due: "2030-04-29",
        how: "自動: udemyCoursesの本数", note: "61歳最後の日の中間旗" },
      // ③ 手動（差分は出さない）
      { room: "仕事", item: "Kindle冊数", goal: "100冊", due: "2030-04-29",
        how: "手動: 現状39冊(2026/8時点・本人申告)", note: "発電所建設" },
      // ④ 半自動（差分は出さない）
      { room: "経済", item: "資産型収入", goal: "年1000万円水準", due: "62歳",
        how: "半自動: Udemy収益は自動・他は経済台帳", note: "87歳は月75万規模で十分" },
      // ⑤ 自動 × 総資産
      { room: "経済", item: "金融資産の積み上げ", goal: "(目標額は次回セッションで設定)", due: null,
        how: "自動: 経済台帳の総資産推移", note: "ねんきん定期便が宿題" },
      // ⑥ 自動 × 教えカウント（目標値がまだ数字でない）
      { room: "精神", item: "ギバー度(教えた人数)", goal: "(基準値は週報数週分の実測後に設定)", due: "87歳まで",
        how: "自動: リミットレス🗣️教えカウント", note: "俺が俺が→ギバーへ" },
      // ⑦ 自動だが、まだ対応する現状の取り方が無い
      { room: "健康", item: "毎朝の散歩", goal: "3〜5km/日", due: "87歳まで継続",
        how: "自動: exerciseログ", note: "太もも・脚力＝健康の大黒柱" },
      // ⑧ 知らない部屋名（無視されるだけで落ちない）
      { room: "宇宙", item: "月面基地", goal: "1つ", due: null, how: "自動: なし", note: "" }
    ]
  }
};

const G = computeGoals(D);
console.log("\n【PART A】WANT台帳 → 部屋ごとの目標×差分");
eq(G.total, 8, "台帳の行数");
eq(G.count, 7, "部屋に割り当てられた行数（知らない部屋「宇宙」は除く）");
eq(G.rooms.health.length, 2, "健康は2行");
eq(G.rooms.work.length, 2, "仕事は2行");
eq(G.rooms.eco.length, 2, "経済は2行");
eq(G.rooms.spirit.length, 1, "精神は1行");
eq(G.rooms.know.length, 0, "知識は0行（この台帳では手動行のみ・今回は入れていない）");

console.log("\n【PART A・パターン①】自動 × 幅つき目標（体重）");
const w = G.rooms.health.filter(x => x.item === "体重")[0];
eq(w.mode, "auto", "自動と判定される");
eq(w.metric, "weight", "現状の取り方から体重に結びつく");
eq(w.cur.value, 83.7, "★現状＝health直近のweight（84.2ではなく最新の83.7）");
eq(w.cur.unit, "kg", "単位");
eq(w.diff.base, 78, "★幅つき目標は、いまの数字に近い78が基準");
eq(w.diff.diff.toFixed(1), "-5.7", "★差分 −5.7kg");
eq(w.diff.done, "false", "未達成");

console.log("\n【PART A・パターン②】自動 × 1点の目標（Udemyコース数）");
const c = G.rooms.work.filter(x => x.item === "Udemyコース数")[0];
eq(c.mode, "auto", "自動");
eq(c.cur.value, 2, "★現状＝登録済みコース本数（作り物では2本）");
eq(c.diff.diff, 98, "★差分＝100−2＝+98本");

console.log("\n【PART A・パターン③】手動・半自動は差分を出さない");
const k = G.rooms.work.filter(x => x.item === "Kindle冊数")[0];
eq(k.mode, "manual", "手動");
eq(k.metric, null, "現状の取り方は結びつけない");
eq(k.cur, null, "現状は出さない");
eq(k.diff, null, "★手動の行では差分を出さない");
eq(k.note, "発電所建設", "備考はそのまま出す");
eq(k.goalText, "100冊", "目標はそのまま出す");
const s = G.rooms.eco.filter(x => x.item === "資産型収入")[0];
eq(s.mode, "semi", "半自動");
eq(s.diff, null, "★半自動の行でも差分を出さない");

console.log("\n【PART A】自動でも出せない行は、空欄になるだけで落ちない");
const eco = G.rooms.eco.filter(x => x.item === "金融資産の積み上げ")[0];
eq(eco.mode, "auto", "自動");
eq(eco.cur.value, 13704370, "現状（総資産）は取れる");
eq(eco.goal.ok, "false", "目標値がまだ数字でない");
eq(eco.diff, null, "★目標が数字でなければ差分は出さない（現状は出る）");
const giver = G.rooms.spirit[0];
eq(giver.metric, "teach", "教えカウントに結びつく");
eq(giver.cur.value, 9, "★現状＝リミットレス🗣️教えの今月数");
eq(giver.cur.unit, "回", "単位");
eq(giver.diff, null, "基準値が未設定なので差分は出さない");
const walk = G.rooms.health.filter(x => x.item === "毎朝の散歩")[0];
eq(walk.mode, "auto", "自動と書かれている");
eq(walk.metric, null, "★まだ対応する現状の取り方が無い");
eq(walk.cur, null, "現状は出さない");
eq(walk.diff, null, "差分も出さない（＝空欄。落ちない）");
eq(walk.goalText, "3〜5km/日", "目標はそのまま出す");

console.log("\n【PART A】台帳に行が増えても、目標値が変わっても、コードは直さない");
const D2 = JSON.parse(JSON.stringify(D));
D2.want.rows.push({ room: "健康", item: "新しい目標", goal: "70kg", due: "2027-04-29",
                    how: "自動: health直近のweight", note: "あとから足した行" });
D2.want.rows[0].goal = "80kg";                       // 目標値を書き換える
const G2 = computeGoals(D2);
eq(G2.rooms.health.length, 3, "★行を足すと、そのまま1行増える");
eq(G2.rooms.health.filter(x => x.item === "新しい目標")[0].diff.diff.toFixed(1), "-13.7",
   "★足した行も差分が出る（70−83.7）");
eq(G2.rooms.health.filter(x => x.item === "体重")[0].diff.diff.toFixed(1), "-3.7",
   "★目標値を80kgに書き換えると差分も追随する（80−83.7）");

console.log("\n【PART B】3点セット");
["health", "work", "eco", "know", "spirit", "priv"].forEach(room => {
  const sh = kitShelf(D, room);
  ok(!!sh.url && !!sh.label, room + ": 🗄書棚のリンクとラベルがある", JSON.stringify(sh));
});
eq(kitShelf(D, "health").label, "GOKIGEN台帳", "健康の書棚＝GOKIGEN台帳");
eq(kitShelf(D, "work").label, "Udemy台帳", "仕事の書棚＝Udemy台帳");
eq(kitShelf(D, "know").label, "リミットレス台帳", "知識の書棚＝リミットレス台帳");
eq(kitShelf(D, "eco").label, "経済台帳", "経済の書棚＝経済台帳");
ok(/drive\.google\.com\/drive\/folders/.test(kitShelf({}, "health").url),
   "links.folders が無い古いdata.jsonでも控えのフォルダURLで開ける", kitShelf({}, "health").url);

const lh = kitLatest(D, "health");
eq(lh.title, "2026-08-16（日）の記録", "📖健康の最新レコード1件");
ok(lh.lines.some(x => x.k === "体重" && x.v === "83.7kg"), "体重が入っている", JSON.stringify(lh.lines));
ok(lh.lines.every(x => x.v !== "null" && x.v !== ""), "空の項目は出さない", JSON.stringify(lh.lines));
const lw = kitLatest(D, "work");
ok(/2026-08-16/.test(lw.title) && lw.lines.some(x => x.k === "累計登録" && x.v === "5,000人"),
   "📖仕事の最新スナップショット", JSON.stringify(lw));
const le = kitLatest(D, "eco");
ok(le.lines[0].k === "総資産" && le.lines[0].v === "13,704,370円", "📖経済の最新（総資産）", JSON.stringify(le.lines[0]));
const lk = kitLatest(D, "know");
ok(/2026-08-16/.test(lk.title) && lk.lines.some(x => x.v === "大崎君にコーチング"),
   "📖知識の最新（リミットレス台帳の直近1行）", JSON.stringify(lk));
const ls = kitLatest(D, "spirit");
// v1.6【言葉化】「7/10」→「7点（満点10点・8/16）」
ok(ls.lines.some(x => x.k === "ご機嫌度" && /7点（満点10点/.test(x.v)), "📖精神は ご機嫌度も添える", JSON.stringify(ls.lines));
const lp = kitLatest(D, "priv");
ok(/2026-08-16/.test(lp.title) && lp.lines.some(x => x.v === "家族と焼肉"), "📖家族の最新（直近の会食）", JSON.stringify(lp));
eq(kitLatest({ health: [] }, "health"), null, "記録が無ければ null（呼び出し側が「記録なし」と出す）");
eq(kitLatest({}, "eco"), null, "経済台帳が空でも落ちない");

console.log("\n【PART B】📊全期間");
eq(KIT_GRAPH.health.kind + ":" + KIT_GRAPH.health.series, "tab:weight", "健康＝体重（既存の推移タブを流用）");
eq(KIT_GRAPH.work.kind + ":" + KIT_GRAPH.work.series, "tab:udemy", "仕事＝累計登録者（既存流用）");
eq(KIT_GRAPH.eco.kind, "scroll", "経済＝新設した総資産の推移へ");
["know", "spirit", "priv"].forEach(r => eq(KIT_GRAPH[r].kind, "text", r + "＝リンク＋最新数値"));
ok(/リミットレス台帳 1行/.test(kitAllTime(D, "know")), "知識の全期間の数字", kitAllTime(D, "know"));
// v1.6【言葉化】「平均 7.5/10」→「平均 7.5点（… 満点10点）」
ok(/平均 7\.5点/.test(kitAllTime(D, "spirit")) && /満点10点/.test(kitAllTime(D, "spirit")),
   "精神の全期間の数字", kitAllTime(D, "spirit"));
ok(/会食 1回/.test(kitAllTime(D, "priv")), "家族の全期間の数字", kitAllTime(D, "priv"));

console.log("\n【PART B】総資産の推移（ログ2点目から線を描く）");
const t2 = computeEcoTrend(D);
eq(t2.ok, "true", "2点あれば線を描く");
eq(t2.delta, 704370, "期間の増減");
const D1 = JSON.parse(JSON.stringify(D));
D1.eco.history = [{ date: "2026-08-16", total: 13704370, level: "class", rows: 4 }];
const t1 = computeEcoTrend(D1);
eq(t1.ok, "false", "★1点だけなら線は描かない");
eq(t1.points.length, 1, "数値は1点だけ返す");
ok(/2日目から出ます/.test(t1.reason), "理由を日本語で返す", t1.reason);
const t0 = computeEcoTrend({ eco: { rows: [], history: [] } });
eq(t0.ok + "/" + t0.points.length, "false/0", "記録が無くても落ちない");
const tOld = computeEcoTrend({ eco: { total: 500, rows: [{ level: "class", amount: 500 }], asOf: "2026-08-16" } });
eq(tOld.points.length, 1, "history が無い古いdata.jsonでも最新の数値だけは出せる");

console.log("\n【PART C】週報書棚（リンクだけ・中身は読まない）");
const wk = computeWeekly(D);
eq(wk.count, 2, "書棚の本数");
eq(wk.latest.name, "週報_2026-08-16.gdoc", "★最新1本のファイル名");
ok(/docs\.google\.com/.test(wk.latest.url), "最新1本へのリンク", wk.latest.url);
ok(/drive\.google\.com\/drive\/folders/.test(wk.folderUrl), "書棚フォルダへのリンク", wk.folderUrl);
const wkEmpty = computeWeekly({ weekly: { folderUrl: "https://drive.google.com/drive/folders/1sV", count: 0, latest: null } });
eq(wkEmpty.latest, null, "★空の書棚では最新なし（アプリは「まだ空です」と出す）");
ok(!!computeWeekly({}).folderUrl, "weekly が無い古いdata.jsonでも書棚は開ける", computeWeekly({}).folderUrl);

console.log("\n【互換】want が無い古い data.json でも落ちない");
const Dold = JSON.parse(JSON.stringify(D));
delete Dold.want; delete Dold.weekly; delete Dold.selfVersion; delete Dold.links;
const Gold = computeGoals(Dold);
eq(Gold.count + "/" + Gold.total, "0/0", "★目標は0件になるだけ（＝カードを出さない）");
ok(Object.keys(Gold.rooms).length === 6, "6部屋ぶんの器はそろっている", JSON.stringify(Object.keys(Gold.rooms)));
ok(kitLatest(Dold, "health") != null, "3点セットは古いdata.jsonでも動く");
eq(selfVersion("2026-08-17", undefined).version, "ver57.04", "selfVersionはdata.jsonが無くても出せる");

console.log("\n【実データ】いま公開中の data.json を素通しして落ちないか");
const real = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));
const GR = computeGoals(real);
console.log("   形式 v" + real.version + " ／ WANT台帳 " + GR.total + "行（部屋に出すのは " + GR.count + "行）");
Object.keys(GR.rooms).forEach(r => {
  GR.rooms[r].forEach(x => {
    console.log("   [" + r + "] " + x.item + " 目標=" + x.goalText + " / " + x.mode +
      (x.cur ? " / 現状=" + x.cur.value + x.cur.unit : "") +
      (x.diff ? " / 差分=" + (x.diff.diff > 0 ? "+" : "") + Number(x.diff.diff.toFixed(1)) : ""));
  });
});
const TR = computeEcoTrend(real), WR = computeWeekly(real);
console.log("   総資産の推移: " + (TR.ok ? TR.points.length + "点（" + TR.first.date + "〜" + TR.last.date + "）"
                                        : TR.reason));
console.log("   週報書棚: " + WR.count + "本" + (WR.latest ? "／最新 " + WR.latest.name : ""));
console.log("   自己バージョン: " + selfVersion(new Date().toISOString().slice(0, 10)).version);
ok(GR.count >= 0 && !!TR && !!WR, "実データでも形がそろっている");
["health", "work", "eco", "know", "spirit", "priv"].forEach(r => {
  let e = null;
  try { kitLatest(real, r); kitAllTime(real, r); kitShelf(real, r); } catch (x) { e = x; }
  ok(!e, "実データの3点セット（" + r + "）が落ちない", String(e));
});

console.log(fail ? "\n❌ " + fail + "件 失敗\n" : "\n全ケース合格 ✅\n");
process.exit(fail ? 1 : 0);
