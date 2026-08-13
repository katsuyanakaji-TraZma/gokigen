/**
 * Udemy台帳の合算ロジックのテスト（node tools/test/test-udemy.js）
 *
 * 確かめること：
 *   ・列の並びが違う3種類（base台帳ログ / 旧スナップショット / デルタ）を、見出しの名前で正しく読めるか
 *   ・「月間収益(USD)」を「累計収益」と取り違えないか
 *   ・同じ記録日×コースIDは、強いファイル（デルタ）が勝つか。空欄だけ弱い方で埋まるか
 *   ・2026-08-12 の累計登録の合計が 69,743人 になるか
 *   ・月次グラフで、その月に記録の無いコースが前月から持ち越されるか
 */
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "update-data.gs"), "utf8");
const pick = (a, b) => src.slice(src.indexOf(a), b ? src.indexOf(b) : undefined);

// Apps Script 側の道具を、テスト用に最小限だけ用意する
const tzUsed = [];                       // 時刻をどのタイムゾーンで書き出したかを記録する
const Utilities = {
  formatDate: (d, tz, fmt) => {
    const p = n => String(n).padStart(2, "0");
    if (fmt === "H:mm") { tzUsed.push(tz); return d.getHours() + ":" + p(d.getMinutes()); }
    if (fmt === "yyyy/M") return d.getFullYear() + "/" + (d.getMonth() + 1);
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
};
const Logger = { log: () => {} };

eval(pick("var CONFIG", "// ===== STEP1"));
eval(pick("// ===== Udemy台帳（base + デルタの合算） =====", "// 今公開中の data.json"));
eval(pick("// ===== 変換ヘルパー =====", "// ===== GitHub ====="));

// 台帳のタイムゾーンは東京ではない（Apps Scriptの既定はロサンゼルス）。ここがズレの元だった。
const SHEET_TZ = "America/Los_Angeles";
const sheet = values => ({
  getDataRange: () => ({ getValues: () => values }),
  getParent: () => ({ getSpreadsheetTimeZone: () => SHEET_TZ })
});

let fail = 0;
const ok = (cond, name, detail) => {
  console.log((cond ? "✅ " : "❌ ") + name + (cond ? "" : "\n     " + detail));
  if (!cond) fail++;
};
const eq = (got, want, name) => ok(String(got) === String(want), name, "結果=" + got + "  期待=" + want);

/* ---------- 1. 3つの形式を、見出しの名前で読めるか ---------- */

// base の「台帳ログ」: 記録日, コースID, 累計登録, 累計収益(USD), 評価, 出所（6列・基準時刻もコース名も無い）
const BASE = [
  ["記録日", "コースID", "累計登録", "累計収益(USD)", "評価", "出所"],
  ["2021/10/15", "C10", 12, 0, 4.5, "Udemyダッシュボード"],
  ["2026/8/9", "C10", 17791, 67143.26, 4.18, "Udemyダッシュボード"]
];
const baseRows = readLedgerSheet_(sheet(BASE), "Udemy台帳_base");
eq(baseRows.length, 2, "base台帳ログ: 2行読める");
eq(baseRows[0].date, "2021-10-15", "base台帳ログ: 2021/10/15 を日付として読む");
eq(baseRows[1].cumEnroll, 17791, "base台帳ログ: 累計登録を読む");
eq(baseRows[1].cumRevenue, 67143.26, "base台帳ログ: 累計収益(USD)を読む");
eq(baseRows[1].time, null, "base台帳ログ: 無い列（基準時刻）はnullになる");

// 旧スナップショット: 10列。「月間収益(USD)」を累計と取り違えないことが肝心
const LEGACY = [
  ["記録日", "基準時刻", "コースID", "コース名", "公開年月", "累計登録", "月間登録", "累計収益(USD)", "月間収益(USD)", "評価"],
  ["2026/8/12", "8:00", "C10", "部下と組織の可能性を開くリーダーになる！", "2021/10", 17791, 68, "$67143.26", "$99999.99", 4.18]
];
const legacyRows = readLedgerSheet_(sheet(LEGACY), "Udemy台帳_2026-08-12");
eq(legacyRows[0].cumRevenue, 67143.26, "旧スナップショット: 累計収益を読む（月間収益と取り違えない）");
eq(legacyRows[0].monthEnroll, 68, "旧スナップショット: 月間登録を読む");
eq(legacyRows[0].published, "2021/10", "旧スナップショット: 公開年月を読む");

// デルタ: 8列・見出しの前に空行がある・「累計収益USD」とかっこ無し表記
const DELTA_HEAD = [
  ["", "", "", "", "", "", "", ""],
  ["記録日", "基準時刻", "コースID", "コース名", "累計登録", "累計収益USD", "評価", "出所"]
];
const deltaRows = readLedgerSheet_(
  sheet(DELTA_HEAD.concat([["2026-08-12", "9:36", "C10", "部下と組織の…", 17807, 67512.44, 4.17, "アプリスクショ"]])),
  "Udemy台帳ログ_2026-08-12");
eq(deltaRows.length, 1, "デルタ: 見出しの前に空行があっても読める");
eq(deltaRows[0].cumRevenue, 67512.44, "デルタ: 「累計収益USD」（かっこ無し）を読む");
eq(deltaRows[0].time, "9:36", "デルタ: 基準時刻を読む");
eq(deltaRows[0].src, "アプリスクショ", "デルタ: 出所を読む");

/* ---------- 2. 同じ記録日×コースIDの重複排除 ---------- */
const merged = mergeLedger_(legacyRows[0], deltaRows[0]);   // 弱い順に読むので legacy → delta
eq(merged.cumEnroll, 17807, "重複排除: 新しいデルタの値が勝つ");
eq(merged.cumRevenue, 67512.44, "重複排除: 収益もデルタが勝つ");
eq(merged.monthEnroll, 68, "重複排除: デルタに無い列（月間登録）は旧ファイルで埋まる");
eq(merged.published, "2021/10", "重複排除: デルタに無い列（公開年月）は旧ファイルで埋まる");

/* ---------- 3. 8/12の実データで累計登録が 69,743人 になるか ---------- */
const AUG12 = [
  ["C01", 313, 235.23, 4.66], ["C02", 4815, 7862.18, 3.99], ["C03", 2775, 4461.73, 4.08],
  ["C04", 3975, 3839.26, 4.09], ["C05", 4509, 7354.36, 4.16], ["C06", 7642, 14896.8, 4.14],
  ["C07", 4852, 11282.77, 4.03], ["C08", 8105, 26405.16, 3.81], ["C09", 14950, 48683.47, 4.01],
  ["C10", 17807, 67512.44, 4.17]
];
const aug12Sheet = sheet(DELTA_HEAD.concat(
  AUG12.map(c => ["2026-08-12", "9:36", c[0], "コース" + c[0], c[1], c[2], c[3], "アプリスクショ"])));
const aug12Rows = readLedgerSheet_(aug12Sheet, "Udemy台帳ログ_2026-08-12");

const built = buildUdemy_({ rows: aug12Rows, courses: [], used: [] }, null);
const snap = built.snapshots[built.snapshots.length - 1];
const total = snap.rows.reduce((a, r) => a + r.cumEnroll, 0);
eq(snap.date, "2026-08-12", "最新スナップショットの日付");
eq(snap.rows.length, 10, "最新スナップショットは10コース");
eq(total, 69743, "★ 2026-08-12 の累計登録の合計 = 69,743人");
eq(built.monthly[built.monthly.length - 1].enroll, 69743, "月次グラフの最新月も 69,743人");
eq(built.courses.length, 10, "コースマスタが無ければスナップショットからコース一覧を作る");

/* ---------- 4. 月次の持ち越し ---------- */
const carry = buildUdemy_({
  rows: [
    { date: "2026-05-10", id: "C09", cumEnroll: 14000, cumRevenue: 100, rating: 4, monthEnroll: null, name: "C09", published: null, time: null },
    { date: "2026-05-10", id: "C10", cumEnroll: 17000, cumRevenue: 200, rating: 4, monthEnroll: null, name: "C10", published: null, time: null },
    // 6月はC10しか記録がない。C09は5月の値を持ち越すはず
    { date: "2026-06-10", id: "C10", cumEnroll: 17500, cumRevenue: 250, rating: 4, monthEnroll: null, name: "C10", published: null, time: null },
    // 7月は記録なし → 6月の値がそのまま続く
    { date: "2026-08-10", id: "C09", cumEnroll: 14900, cumRevenue: 150, rating: 4, monthEnroll: null, name: "C09", published: null, time: null }
  ],
  courses: [{ id: "C09", short: "教える技術" }, { id: "C10", short: "コーチング" }], used: []
}, null);
const ym = {}; carry.monthly.forEach(m => ym[m.ym] = m);
eq(carry.monthly.length, 4, "月次: 5月〜8月の4ヶ月ぶん並ぶ");
eq(ym["2026-06"].enroll, 14000 + 17500, "月次: 6月にC09の記録が無くても5月の値を持ち越す");
eq(ym["2026-07"].enroll, 14000 + 17500, "月次: 7月は記録が無いので6月と同じ");
eq(ym["2026-08"].enroll, 14900 + 17500, "月次: 8月はC09だけ更新、C10は持ち越し");
eq(ym["2026-08"].byCourse.C10.enroll, 17500, "月次: コース別も持ち越される");

/* ---------- 5. baseがまだ無くても2021年からのカーブを失わない ---------- */
const prevJson = {
  udemyMonthly: [
    { ym: "2021-10", enroll: 12, revenue: 0, byCourse: {} },
    { ym: "2026-06", enroll: 69000, revenue: 189000, byCourse: {} },
    { ym: "2026-08", enroll: 69629, revenue: 190226.32, byCourse: {} }   // 古い方の8月。台帳側で上書きされるべき
  ],
  udemyCourses: [{ id: "C10", short: "コーチング講座" }]
};
const rescued = buildUdemy_({ rows: aug12Rows, courses: [], used: [] }, prevJson);
eq(rescued.monthly[0].ym, "2021-10", "base無し: 2021年10月から始まる（前回のdata.jsonから引き継ぐ）");
eq(rescued.monthly[rescued.monthly.length - 1].ym, "2026-08", "base無し: 最新月は2026-08");
eq(rescued.monthly[rescued.monthly.length - 1].enroll, 69743,
  "base無し: 台帳から作れた8月が、引き継ぎ分ではなく最新の69,743人で上書きされる");
eq(rescued.monthly.filter(m => m.ym === "2026-08").length, 1, "base無し: 8月が二重にならない");
eq(rescued.courses[0].short, "コーチング講座", "base無し: コース名は前回のコースマスタを引き継ぐ");

/* ---------- 6. 記録日フォーマットの正規化 ---------- */
eq(toDate_("2026-08-12"), "2026-08-12", "日付正規化: デルタの 2026-08-12");
eq(toDate_("2026/8/9"), "2026-08-09", "日付正規化: 旧スナップショットの 2026/8/9");
eq(toDate_("8/9/2026"), "2026-08-09", "日付正規化: xlsx由来の米国式 8/9/2026");
eq(toDate_("10/13/2021"), "2021-10-13", "日付正規化: 米国式で月が2桁 10/13/2021");
ok(readLedgerSheet_(sheet([["記録日", "コースID", "累計登録", "累計収益(USD)", "評価", "出所"],
    ["8/9/2026", "C10", 17791, 67143.26, 4.18, "台帳"]]), "base")[0].date === "2026-08-09",
  "日付正規化: base台帳ログの米国式日付が読める（正規化前は1行も読めなかった）");

/* ---------- 7. コースIDの取り違え検知 ---------- */
const mixed = [
  { date: "2026-08-09", id: "C10", cumEnroll: 17791 },
  { date: "2026-08-12", id: "C10", cumEnroll: 313 }      // C01の値がC10に入ってしまった想定
];
ok(checkCumulative_(mixed).length === 1, "ID取り違え: 累計登録が減ったら検知する");
ok(checkCumulative_([{ date: "2026-08-09", id: "C10", cumEnroll: 17791 },
                     { date: "2026-08-12", id: "C10", cumEnroll: 17807 }]).length === 0,
  "ID取り違え: 正常に増えていれば何も出ない");

/* ---------- 8. 実データでの月間新規登録（合格基準） ---------- */
// Driveのデルタファイル2本の実データ
const D0811 = [
  ["C01", 309, 205.46, 4.66], ["C02", 4811, 7504.63, 4], ["C03", 2773, 4323.63, 4.08],
  ["C04", 3974, 3792.8, 4.09], ["C05", 4508, 7281.09, 4.17], ["C06", 7642, 14758.17, 4.14],
  ["C07", 4850, 11206.66, 4.03], ["C08", 8104, 26334.14, 3.81], ["C09", 14945, 47686.49, 4.01],
  ["C10", 17802, 67150.21, 4.18]
];
const D0812 = AUG12;
const deltaSheet2 = (date, time, list) => sheet(DELTA_HEAD.concat(
  list.map(c => [date, time, c[0], "コース" + c[0], c[1], c[2], c[3], "アプリスクショ"])));

// Udemy台帳_base の「台帳ログ」から抜いた2026年4月以降の実データ（書式もそのまま）
const BASE_2026 = [
  ["4/20/2026","C02",3822],["4/20/2026","C03",2384],["4/20/2026","C04",3711],["4/20/2026","C05",4242],
  ["4/20/2026","C06",7166],["4/20/2026","C07",4627],["4/20/2026","C08",7948],["4/20/2026","C09",13407],
  ["4/20/2026","C10",17094],
  ["6/5/2026","C02",4256],["6/5/2026","C03",2502],["6/5/2026","C04",3809],["6/5/2026","C05",4320],
  ["6/5/2026","C06",7399],["6/5/2026","C07",4704],["6/5/2026","C08",7993],["6/5/2026","C09",13948],
  ["6/5/2026","C10",17312],
  ["7/10/2026","C01",105],["7/10/2026","C02",4557],["7/10/2026","C03",2629],["7/10/2026","C04",3904],
  ["7/10/2026","C05",4440],["7/10/2026","C06",7545],["7/10/2026","C07",4796],["7/10/2026","C08",8055],
  ["7/10/2026","C09",14520],["7/10/2026","C10",17585],
  ["7/12/2026","C01",109],["7/12/2026","C02",4573],["7/12/2026","C03",2637],["7/12/2026","C04",3908],
  ["7/12/2026","C05",4444],["7/12/2026","C06",7551],["7/12/2026","C07",4800],["7/12/2026","C08",8057],
  ["7/12/2026","C09",14538],["7/12/2026","C10",17591],
  ["7/17/2026","C01",110],["7/17/2026","C02",4626],["7/17/2026","C03",2661],["7/17/2026","C04",3920],
  ["7/17/2026","C05",4455],["7/17/2026","C06",7565],["7/17/2026","C07",4806],["7/17/2026","C08",8063],
  ["7/17/2026","C09",14605],["7/17/2026","C10",17617],
  ["8/1/2026","C01",188],["8/1/2026","C02",4739],["8/1/2026","C03",2737],["8/1/2026","C04",3956],
  ["8/1/2026","C05",4479],["8/1/2026","C06",7616],["8/1/2026","C07",4842],["8/1/2026","C08",8087],
  ["8/1/2026","C09",14846],["8/1/2026","C10",17722],
  ["8/9/2026","C01",285],["8/9/2026","C02",4800],["8/9/2026","C03",2771],["8/9/2026","C04",3968],
  ["8/9/2026","C05",4503],["8/9/2026","C06",7633],["8/9/2026","C07",4850],["8/9/2026","C08",8102],
  ["8/9/2026","C09",14926],["8/9/2026","C10",17791]
];
const baseSheet2026 = sheet([["記録日", "コースID", "累計登録", "累計収益(USD)", "評価", "出所"]]
  .concat(BASE_2026.map(r => [r[0], r[1], r[2], null, null, "台帳"])));

const real = {};
[["Udemy台帳_base", baseSheet2026],
 ["Udemy台帳ログ_2026-08-11", deltaSheet2("2026-08-11", "17:00", D0811)],
 ["Udemy台帳ログ_2026-08-12", deltaSheet2("2026-08-12", "9:36", D0812)]].forEach(([n, sh]) => {
  readLedgerSheet_(sh, n).forEach(r => { const k = r.date + "|" + r.id; real[k] = mergeLedger_(real[k], r); });
});
const realRows = Object.keys(real).sort().map(k => real[k]);
const realBuilt = buildUdemy_({ rows: realRows, courses: [], used: [] }, null);
const M = {}; realBuilt.monthly.forEach(x => M[x.ym] = x);

console.log("\n  【実データの月次】");
realBuilt.monthly.forEach(x => console.log("   " + x.ym + "  累計 " + x.enroll.toLocaleString() +
  "  月間新規 " + (x.newEnroll == null ? "—" : x.newEnroll.toLocaleString()) +
  "  実測区間 " + (x.from || "—") + "〜" + (x.to || "—") + "（記録" + x.records + "日）"));

eq(M["2026-07"].enroll, 68428, "7月末の累計登録（台帳の最終記録 7/17）");
eq(M["2026-08"].enroll, 69743, "8/12時点の累計登録");
ok(M["2026-08"].newEnroll === 69743 - 68428,
  "★合格基準: 2026年8月（12日まで）＝ 69,743 −7月末累計 と一致",
  "結果=" + M["2026-08"].newEnroll + "  期待=" + (69743 - 68428));
// ルールは1本だけ：「その月の最後にある記録の累計 − 前月の最後にある記録の累計」。
// 月末ぴったりの記録が無ければ、その月の最後の記録で代用する（±数日のズレは許容）。
// 日々の増分の積み上げ・「月間登録」列・按分や推定は使わない。
const lastCum = ymd => {                     // その日付の全コース累計を実データから直に足す
  const rows = realRows.filter(r => r.date === ymd);
  return rows.reduce((a, r) => a + (r.cumEnroll || 0), 0);
};
eq(M["2026-07"].newEnroll, lastCum("2026-07-17") - lastCum("2026-06-05"),
  "★ルール①: 7月＝(7月最後の記録 7/17の累計) −(6月最後の記録 6/5の累計)");
eq(M["2026-07"].from + "〜" + M["2026-07"].to, "2026-06-05〜2026-07-17",
  "★ルール①: 実測区間が data.json に残る（表示側が期間を明示できる）");
ok(M["2026-08"].newEnroll !== M["2026-08"].enroll,
  "月間新規と累計を取り違えていない");

/* ---------- 9. 基準時刻のタイムゾーン（6:30 が 23:30 になっていた件） ---------- */
// 時刻だけのセルは、そのシートのタイムゾーンで作られたDateとして渡ってくる。
// これを Asia/Tokyo 固定で書き出すと時差ぶんズレる。作られたときと同じ zone で書き戻すのが正しい。
tzUsed.length = 0;
const timeRows = readLedgerSheet_(sheet(DELTA_HEAD.concat(
  [["2026-08-13", new Date(2026, 7, 13, 6, 30), "C10", "部下と組織の…", 17817, 67512.44, 4.18, "アプリスクショ"]])),
  "Udemy台帳ログ_2026-08-13");
eq(timeRows[0].time, "6:30", "★時刻セルが台帳で見たまま（6:30）で読める");
eq(tzUsed[0], SHEET_TZ, "★時刻はそのシートのタイムゾーンで書き戻す");
ok(tzUsed.indexOf("Asia/Tokyo") < 0,
  "時刻の書き出しに Asia/Tokyo 固定を使っていない（使うと6:30が23:30になる）", tzUsed.join(","));
eq(readLedgerSheet_(sheet(DELTA_HEAD.concat(
  [["2026-08-13", "6:30", "C10", "コース", 17817, 67512.44, 4.18, "台帳"]])), "delta")[0].time, "6:30",
  "文字で「6:30」と入っている台帳はそのまま読む");

console.log(fail === 0 ? "\n全ケース合格 ✅" : "\n" + fail + "件 不一致 ❌");
process.exit(fail === 0 ? 0 : 1);
