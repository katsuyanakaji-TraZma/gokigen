/**
 * v1.5 経済の二階建て・3系列・ホワイトリスト・月間サニティのテスト
 *   （node tools/test/test-eco2.js）
 *
 * 正本: Drive「経済の部屋・観測定義書_v2確定版_2026-08-18」（📮_Claude納品箱）
 *
 * 確かめること（本人が出した修理6点にそのまま対応）：
 *   ①【要件1】UdemyのコースIDは C01〜C10 だけを取り込み、「全体」等は警告つきで無視する
 *   ②【要件2】項目名に「合計／総額／My資産」が入る行は小計扱いで item の合算から外す
 *   ③【要件3】月間サニティ（Udemy 1,500人超／経済 同一日の合算と総括行の乖離5%超）
 *   ④【要件4】家画面の経済カードが「個人資産合計を円で」出す。前回比は比較できる2点だけ
 *   ⑤【要件5】推移は3系列。合計線は4口座が同じ日に揃った日だけ点を打つ（偽の急落を作らない）
 *   ⑥【要件6】区分「法人」は個人合算・合計線から完全除外し、独立した法人メーターになる
 *
 * 判定は固定の作り物データで行う。いちばん下だけ、いま公開中の data.json を素通しして
 * 落ちないことを確かめる（data.json は毎日変わるため、数字の判定はしない）。
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
const has = (hay, needle, name) => ok(hay.indexOf(needle) >= 0, name, "「" + needle + "」が見つからない");

/* ========== Apps Script 側 ========== */
const logs = [];
const Logger = { log: m => logs.push(String(m)) };
const Utilities = {
  formatDate: (d, tz, fmt) => {
    const p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
};
const pickGs = (a, b) => {
  const i = gs.indexOf(a), j = gs.indexOf(b);
  if (i < 0 || j < 0) throw new Error("update-data.gs に目印が見つかりません: " + (i < 0 ? a : b));
  return gs.slice(i, j);
};
eval(pickGs("var LIMITLESS_FOLDER_ID", "// ===== STEP1"));
eval(pickGs("// ===== Udemy台帳（base + デルタの合算） =====", "// 今公開中の data.json"));
eval(pickGs("var ECO_COLS", "function readEco_"));
eval(pickGs("function ecoHistory_(all) {", "// ===== v1.4: WANT台帳"));

/* ---------- ①【要件1】コースIDのホワイトリスト ---------- */
console.log("\n【要件1】UdemyのコースIDは C01〜C10 だけ");
["C01", "C05", "C10", "c07", " C02 "].forEach(id =>
  ok(isUdemyCourseId_(id), "「" + id + "」は取り込む", id));
["全体", "合計", "C11", "C00", "TOTAL", "", null].forEach(id =>
  ok(!isUdemyCourseId_(id), "★「" + id + "」は取り込まない（集計行とみなす）", String(id)));
has(gs, "未知のコースIDをスキップ: ", "警告ログの文言がある");
has(gs, "skipped[k] = { id: r.id, src: s.name, n: 0 }", "落とした行をファイル・IDごとに数えている");

/* ---------- ②【要件2】小計行を item の合算から外す ---------- */
console.log("\n【要件2】項目名が「合計／総額／My資産」の行は小計");
eq(ecoLevel_("現金", "SBI My資産合計"), "total", "★区分が「現金」でも項目名がMy資産合計なら小計");
eq(ecoLevel_("米国株式", "米国株式 合計"), "total", "「合計」を含めば小計");
eq(ecoLevel_("現金", "預り金 総額"), "total", "「総額」を含めば小計");
eq(ecoLevel_("総括", "SBI証券口座 合計"), "total", "これまでどおり区分「総括」も小計");
eq(ecoLevel_("資産クラス", "貴金属(金銀プラチナ)"), "class", "★資産クラスは巻き添えにしない");
eq(ecoLevel_("米国株式", "パランティア PLTR"), "item", "個別銘柄は内訳のまま");
eq(ecoLevel_("メモ", "参考為替"), "memo", "メモはこれまでどおり");
eq(ecoLevel_("総括"), "total", "★引数1つの古い呼び方でも落ちない");
eq(ecoLevel_(null), "item", "区分も項目名も無ければ内訳");

/* ---------- 口座の見分け（要件5・6の土台） ---------- */
console.log("\n【要件5・6】出所／項目／備考から口座を見分ける");
eq(ecoAccount_("法人", "法人口座 普通預金", ""), "corp", "★区分「法人」は法人");
eq(ecoAccount_("現金", "みずほ銀行 普通預金", "法人口座"), "corp", "★銀行にあっても法人なら法人（最優先）");
eq(ecoAccount_("国内株式", "野村證券 国内株式", "アプリスクショ"), "nomura", "野村は野村線へ");
eq(ecoAccount_("資産クラス", "貴金属(金銀プラチナ)", ""), "gold", "貴金属口座");
eq(ecoAccount_("総括", "金・銀・プラチナ口座 合計", "gold.sbisec側"), "gold", "gold.sbisec も貴金属口座");
ok(ecoAccount_("米国株式", "ウィートンプレシャスメタルズ WPM", "貴金属ロイヤルティ") !== "gold",
   "★備考の「貴金属ロイヤルティ」を金口座と取り違えない（SBIメインの米国株）",
   "gold と判定してしまった");
eq(ecoAccount_("米国株式", "ウィートンプレシャスメタルズ WPM", "貴金属ロイヤルティ"), null,
   "　→ 出所が書かれていないので判定不能。SBIメインとして数え、警告に出す");
eq(ecoAccount_("米国株式", "アグニコイーグル AEM", "金鉱株"), null,
   "★備考の「金鉱株」も金口座ではない（出所が無いので判定不能）");
eq(ecoAccount_("現金", "SBI 預り金(円)", ""), "sbi", "SBIメイン");
eq(ecoAccount_("現金", "三井住友 個人銀行", ""), "bank", "個人銀行");
eq(ecoAccount_("米国株式", "パランティア PLTR", "最大保有"), null, "★出所が無ければ判定不能（あとで警告）");

/* ---------- 実際の台帳3本を、そのままの数字で通す ---------- */
/* 2026-08-13 経済台帳ログ（旧列）… 野村4行＋SBI4行 */
const L0813 = [
  ["野村證券 国内株式", "国内株式", 612800, "アプリスクショ20:37"],
  ["野村證券 国内投信", "投資信託", 10150245, "アプリスクショ20:37"],
  ["野村證券 外国債券", "外国債券", 157313, "アプリスクショ20:37"],
  ["野村證券 MRF・お預り金", "現金", 133546, "アプリスクショ20:37"],
  ["SBI証券 米国株式", "米国株式", 5819015, "アプリスクショ20:39"],
  ["SBI証券 外貨建債券", "外国債券", 4977928, "アプリスクショ20:39"],
  ["SBI証券 預り金(円)", "現金", 9981, "アプリスクショ20:41"],
  ["SBI証券 預り金(米ドル)", "現金", 2261603, "アプリスクショ20:41"]
];
/* 2026-08-16 経済台帳_base … 総括3・資産クラス5・個別2（合計に効くのは資産クラスだけ） */
const L0816 = [
  ["SBI証券口座 合計", "総括", 13104897, "前日比0円・23:15時点"],
  ["金・銀・プラチナ口座 合計", "総括", 599473, "gold.sbisec側"],
  ["総資産(証券+貴金属)", "総括", 13704370, "2口座の合算"],
  ["米国株式", "資産クラス", 5858562, ""],
  ["外貨建債券(米国債)", "資産クラス", 4975744, ""],
  ["預り金(円)", "資産クラス", 9981, ""],
  ["預り金(米ドル)", "資産クラス", 2260610, "USD/JPY 159.34"],
  ["貴金属(金銀プラチナ)", "資産クラス", 599473, ""],
  ["ウィートンプレシャスメタルズ WPM", "米国株式", 235235, "貴金属ロイヤルティ"],
  ["パランティア PLTR", "米国株式", 2773153, "最大保有・株式の約47%"],
  ["参考為替", "メモ", null, "USD/JPY 159.34"]
];
/* 2026-08-18 経済台帳ログ … SBIメインだけ。個別行の合算がちょうど 13,094,607円 */
const L0818 = [
  ["アグニコイーグルマインズ AEM", "米国株式", 690759, "現在値188.78"],
  ["アリスタネットワークス ANET", "米国株式", 128417, "現在値201.80"],
  ["フランコネバダ FNV", "米国株式", 37952, "現在値238.56"],
  ["ヴァンエック金鉱株ETF GDX", "米国株式", 73093, "現在値91.89"],
  ["ヴァンエック中小型金鉱株ETF GDXJ", "米国株式", 191512, "現在値120.38"],
  ["SPDRゴールドミニシェアーズ GLDM", "米国株式", 111299, "現在値87.45"],
  ["アルファベットA GOOGL", "米国株式", 273634, "現在値344.00"],
  ["ロビンフッドマーケッツA HOOD", "米国株式", 535934, "現在値96.25"],
  ["インタラクティブブローカーズ IBKR", "米国株式", 240111, "現在値94.33"],
  ["ORロイヤルティーズ OR", "米国株式", 106049, "現在値33.33"],
  ["パランティアテクノロジーズ PLTR", "米国株式", 2745097, "現在値172.55"],
  ["テックリソーシズB TECK", "米国株式", 10315, "現在値64.84"],
  ["台湾セミコンダクターADR TSM", "米国株式", 411378, "現在値430.97"],
  ["ウーバーテクノロジーズ UBER", "米国株式", 23860, "現在値74.99"],
  ["グローバルXウラニウムETF URA", "米国株式", 35994, "現在値45.25"],
  ["ウィートンプレシャスメタルズ WPM", "米国株式", 239066, "現在値136.61"],
  ["シーブリッジゴールド SA", "米国株式", 5157, "一般口座・現在値32.42"],
  ["SBI 外貨建債券", "外国債券", 4967936, ""],
  ["SBI 預り金(円)", "現金", 9981, ""],
  ["SBI 預り金(米ドル)", "現金", 2257063, "為替159.09円(8/17 14:31)・SBI My資産合計13094607円は個別行の合算に一致"]
];
// readEco_ が1行を組み立てるのと同じ手順（level と account を必ず通す）
const mk = (date, list, srcFallback) => list.map(r => ({
  date: date, name: r[0], cat: r[1], amount: r[2],
  level: ecoLevel_(r[1], r[0]),
  account: ecoAccount_(r[1], r[0], r[3] || srcFallback),
  src: r[3] || srcFallback
}));
const ALL = []
  .concat(mk("2026-08-13", L0813, "経済台帳ログ_2026-08-13"))
  .concat(mk("2026-08-16", L0816, "経済台帳_base"))
  .concat(mk("2026-08-18", L0818, "経済台帳ログ_2026-08-18"));

console.log("\n【要件5】記録日ごとの口座別残高（本物の台帳3本の数字で）");
const H = ecoHistory_(ALL);
eq(H.length, 3, "記録日3日ぶんの点ができる");
eq(H[0].date + " sbi=" + H[0].sbi, "2026-08-13 sbi=13068527", "8/13 SBIメイン");
eq(H[0].nomura, 11053904, "★8/13 野村（11,053,904円）が野村線に分かれる");
eq(H[0].total, 24122431, "8/13 は届いた2口座の合計");
eq(H[1].date + " sbi=" + H[1].sbi, "2026-08-16 sbi=13104897",
   "★8/16 SBIメインは資産クラス4行だけを足して台帳の「SBI証券口座 合計」と一致");
eq(H[1].gold, 599473, "★8/16 貴金属は別口座として分かれる");
eq(H[1].total, 13704370, "8/16 の合計は台帳の「総資産(証券+貴金属)」と一致");
eq(H[2].date + " sbi=" + H[2].sbi, "2026-08-18 sbi=13094607",
   "★8/18 SBIメイン＝13,094,607円（個別行の合算＝Udemy収益ではない）");
eq(H[2].nomura, undefined, "8/18 は野村の記録が無いので野村線に点を打たない");
eq(H.filter(p => p.complete).length, 0,
   "★4口座が揃った日はまだ無い＝合計線は点なし（偽の急落を作らない）");
eq(H[1].accounts.join(","), "gold,sbi", "その日に届いた口座が分かる");

console.log("\n【要件5】4口座が揃った日だけ合計線に点が打たれる");
const FULL = ALL.concat(mk("2026-08-22", [
  ["SBI 米国株式", "資産クラス", 10000000, "SBIメイン"],
  ["SBI 貴金属", "資産クラス", 600000, "SBI貴金属"],
  ["野村證券 国内投信", "資産クラス", 11000000, "野村"],
  ["三菱UFJ 個人銀行", "現金", 2000000, "個人銀行"]
], "経済台帳ログ_2026-08-22"));
const H2 = ecoHistory_(FULL);
const last = H2[H2.length - 1];
eq(last.complete, "true", "★4口座が揃った日は complete＝true");
eq(last.total, 23600000, "★合計線の点＝個人の真の総資産（4口座の合計）");
eq(H2.filter(p => p.complete).length, 1, "揃った日だけが合計線の点になる");

console.log("\n【要件6】区分「法人」は個人から完全に切り離される");
const WITH_CORP = FULL.concat(mk("2026-08-22", [
  ["法人口座 普通預金", "法人", 45000000, "法人"]
], "経済台帳ログ_2026-08-22"));
const personal = WITH_CORP.filter(r => r.account !== "corp");
const corpRows = WITH_CORP.filter(r => r.account === "corp");
const H3 = ecoHistory_(personal);
eq(H3[H3.length - 1].total, 23600000, "★法人4,500万円は個人の合計に1円も入らない");
eq(ecoHistory_(WITH_CORP)[H3.length - 1].total, 23600000,
   "★ecoHistory_ に法人行を渡しても、合計線に混ざらない（二重の歯止め）");
const corp = ecoCorp_(corpRows);
eq(corp.monthly.length, 1, "法人メーターは月次で持つ");
eq(corp.latest.amount, 45000000, "★法人メーターの値は独立して出る");
eq(corp.latest.ym, "2026-08", "月で並ぶ");
const corp2 = ecoCorp_(corpRows.concat(mk("2026-08-28", [
  ["法人口座 普通預金", "法人", 46000000, "法人"]], "x")));
eq(corp2.monthly.length, 1, "★同じ月に2回書いても月1点（新しい方を採る）");
eq(corp2.latest.amount, 46000000, "新しい記録が勝つ");

console.log("\n【要件3・5】経済台帳の健全性チェック");
const W = ecoWarnings_(ALL, H);
const wUnknown = W.filter(x => x.kind === "ecoAccountUnknown");
ok(wUnknown.length >= 1, "★出所が書かれていない行は警告に出る", JSON.stringify(W));
eq(wUnknown[0].level, "info", "出所の書きもれは情報（毎日の運用を止めない）");
eq(W.filter(x => x.kind === "ecoTotalGap").length, 0,
   "★正しい台帳では乖離の警告は出ない（8/16は合算と総括行がぴったり一致）");
// 二重計上：資産クラスを1行余計に書いてしまった日を作る
const DUP = mk("2026-08-16", L0816.concat([["米国株式(重複)", "資産クラス", 5858562, ""]]), "経済台帳_base");
const WD = ecoWarnings_(DUP, ecoHistory_(DUP));
const gap = WD.filter(x => x.kind === "ecoTotalGap");
eq(gap.length, 1, "★同じ資産を二重に書くと乖離の警告が出る");
eq(gap[0].level, "warn", "乖離は警告レベル");
has(gap[0].text, "二重に書いていないか", "警告文が原因を指している");
// 5%以内の小さなズレでは出さない
const SMALL = mk("2026-08-16", [
  ["総資産", "総括", 10000000, ""],
  ["米国株式", "資産クラス", 10200000, ""]
], "x");
eq(ecoWarnings_(SMALL, ecoHistory_(SMALL)).filter(x => x.kind === "ecoTotalGap").length, 0,
   "★2%のズレでは警告を出さない（毎日⚠️が出ると誰も見なくなる）");

console.log("\n【要件3】Udemyの月間サニティ（見るのは最新の月だけ）");
const LED = { rows: [], skipped: [] };
const M_OK = [{ ym: "2026-07", officialNew: 2185, newEnroll: 2185, to: "2026-07-17" },
              { ym: "2026-08", officialNew: 842, newEnroll: 1624, to: "2026-08-18" }];
let w1 = buildWarnings_(LED, [], "2026-08-18", M_OK);
eq(w1.filter(x => x.kind === "monthSanity").length, 0,
   "★8月842人なら警告なし（過去の2,185人には遡らない＝最新の月だけ見る）");
const M_NG = [{ ym: "2026-08", officialNew: 1684, newEnroll: 1684, to: "2026-08-18" }];
let w2 = buildWarnings_(LED, [], "2026-08-18", M_NG);
eq(w2.filter(x => x.kind === "monthSanity").length, 1, "★1,500人超で「二重計上疑い」の警告");
has(w2.filter(x => x.kind === "monthSanity")[0].text, "二重に入っていないか", "警告文が二重計上を指している");
eq(w2.filter(x => x.kind === "monthSanity")[0].level, "warn", "警告レベル");
// 「月間登録」列が無い月は累計の差で見る
let w3 = buildWarnings_(LED, [], "2026-08-18",
  [{ ym: "2026-08", officialNew: null, newEnroll: 3000, to: "2026-08-18", from: "2026-07-17" }]);
eq(w3.filter(x => x.kind === "monthSanity").length, 1, "列が無い月は累計の差で判定する");
eq(buildWarnings_(LED, [], "2026-08-18", []).filter(x => x.kind === "monthSanity").length, 0,
   "月次がまだ無くても落ちない");

console.log("\n【要件1】ホワイトリストから外れたIDは警告になる");
const w4 = buildWarnings_({ rows: [], skipped: [{ id: "全体", src: "Udemy台帳ログ_2026-08-18", n: 1 }] },
                          [], "2026-08-18", []);
const uw = w4.filter(x => x.kind === "unknownCourseId");
eq(uw.length, 1, "★「全体」行を落としたことが警告に出る");
eq(uw[0].level, "warn", "警告レベル（黙って捨てない）");
has(uw[0].text, "全体", "どのIDを落としたかが書いてある");

console.log("\n【要件1・④】台帳の「月間登録」列を月次に持つ");
has(gs, "officialNew: off ? off.n : null", "月次に officialNew を持たせている");
has(gs, "officialAsOf: off ? off.date : null", "いつ時点の実測かも持たせている");
const LEDGER = {
  courses: [{ id: "C01", short: "組織適応" }, { id: "C02", short: "老害" }],
  rows: [
    { date: "2026-07-17", id: "C01", cumEnroll: 100, monthEnroll: 20, cumRevenue: 10 },
    { date: "2026-07-17", id: "C02", cumEnroll: 200, monthEnroll: 30, cumRevenue: 20 },
    { date: "2026-08-01", id: "C01", cumEnroll: 110, monthEnroll: null, cumRevenue: 11 },
    { date: "2026-08-01", id: "C02", cumEnroll: 210, monthEnroll: null, cumRevenue: 21 },
    { date: "2026-08-09", id: "C01", cumEnroll: 118, monthEnroll: 8, cumRevenue: 12 },
    { date: "2026-08-09", id: "C02", cumEnroll: 216, monthEnroll: 6, cumRevenue: 22 },
    { date: "2026-08-18", id: "C01", cumEnroll: 125, monthEnroll: 15, cumRevenue: 13 },
    { date: "2026-08-18", id: "C02", cumEnroll: 222, monthEnroll: 12, cumRevenue: 23 }
  ]
};
const U = buildUdemy_(LEDGER, null);
const aug = U.monthly.filter(m => m.ym === "2026-08")[0];
eq(aug.officialNew, 27, "★その月でいちばん新しい、列が埋まっている日の合計（8/18の15+12）");
eq(aug.officialAsOf, "2026-08-18", "★8/09の途中経過ではなく8/18を採る");
eq(aug.newEnroll, 47, "累計の差（7/17基準）はこれまでどおり別に持つ");
eq(U.monthly.filter(m => m.ym === "2026-07")[0].officialNew, 50, "7月も列から拾える");

/* ========== アプリ側（index.html） ========== */
const leak = code => code.replace(/^(const|let) /gm, "var ");
const pickHtml = (a, b) => {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0) throw new Error("index.html に目印が見つかりません: " + (i < 0 ? a : b));
  return html.slice(i, j);
};
eval(leak(pickHtml("/* ===== util ===== */", "/* ===== state ===== */")));
eval(leak(pickHtml("/* ===== 知識の部屋（リミットレス台帳の集計）ここから =====", "/* ===== 知識の部屋 ここまで ===== */")));
eval(leak(pickHtml("/* ===== v1.4 目標×差分（WANT台帳）ここから =====", "/* ===== v1.4 目標×差分 ここまで ===== */")));
eval(leak(pickHtml("/* ===== v1.4 3点セット（📖最新を読む／🗄書棚／📊全期間）ここから =====",
                   "/* ===== v1.4 3点セット ここまで ===== */")));
eval(leak(pickHtml("/* ===== v1.5 経済（個人資産カード／法人メーター）ここから =====",
                   "/* ===== v1.5 経済 ここまで ===== */")));

// Apps Script が作るのと同じ形の data.json を組み立てる
const mkData = (all, monthly) => {
  const per = all.filter(r => r.account !== "corp");
  const hist = ecoHistory_(per);
  const latest = per.length ? per[per.length - 1].date : null;
  return {
    eco: { asOf: latest, rows: per.filter(r => r.date === latest), history: hist,
           total: hist.length ? hist[hist.length - 1].total : 0,
           corp: ecoCorp_(all.filter(r => r.account === "corp")),
           warnings: ecoWarnings_(all, hist) },
    udemyMonthly: monthly || []
  };
};

console.log("\n【要件4】家画面の経済カード（円・カンマ区切り／前回比は比較できる2点だけ）");
const D = mkData(ALL);
const card = ecoCard(D);
eq(fmtYen(card.total), "¥13,094,607", "★カードの値は個人資産合計を円で（$192,538ではない）");
eq(card.asOf, "2026-08-18", "基準日は台帳の最新の記録日");
eq(card.delta, null, "★8/18(SBIのみ)と8/16(SBI+貴金属)は口座の顔ぶれが違うので引き算しない");
has(card.deltaText, "口座の顔ぶれ", "なぜ前回比が出ないかを画面に書く");
eq(ecoMissing(card.accounts).join("・"), "SBI貴金属・野村・個人銀行", "★足りない口座が言える");
// 同じ顔ぶれの日が2つあれば、そこで前回比を出す
const SAME = ALL.concat(mk("2026-08-20", [
  ["SBI 米国株式", "資産クラス", 6000000, "SBIメイン"],
  ["SBI 預り金(円)", "資産クラス", 7194607, "SBIメイン"]
], "x"));
const card2 = ecoCard(mkData(SAME));
eq(card2.total, 13194607, "最新の個人資産合計");
eq(card2.delta, 100000, "★同じ顔ぶれ（SBIメインだけ）の日どうしで前回比を出す");
eq(card2.from, "2026-08-18", "どの日と比べたかを持つ");
eq(signedYen(card2.delta), "+¥100,000", "前回比も円・カンマ区切り");
eq(fmtYen(0), "¥0", "0円でも落ちない");
eq(ecoCard({ eco: {} }).total, null, "経済台帳が空でも落ちない");

console.log("\n【要件5】アプリ側の3系列");
const T = computeEcoTrend(D);
eq(T.series.map(s => s.label).join(","), "SBI,野村,合計", "★凡例は3つ（SBI／野村／合計）");
eq(T.series.map(s => s.color).join(","), "#4a7eff,#22c77a,#ffb800", "★3色そろっている");
eq(T.series[0].values.join(","), "13068527,13104897,13094607", "★SBI線は3日ぶんつながる（偽の急落なし）");
eq(T.series[1].values.join(","), "11053904,,", "野村線は記録のある日だけ（あとは空＝点なし）");
eq(T.series[2].values.filter(v => v != null).length, 0, "★合計線は4口座が揃うまで点なし");
eq(T.ok, "true", "SBI線が2点以上あるので線は引ける");
const T2 = computeEcoTrend(mkData(FULL));
eq(T2.series[2].values.filter(v => v != null).length, 1, "★揃った日に合計線の点が1つ出る");
eq(T2.series[2].last, 23600000, "合計線の値＝個人の真の総資産");
// 8/13と8/16をそのまま1本の線にすると、野村1,105万円ぶんの偽の急落になる
const naive = [24122431, 13704370];
ok(naive[0] - naive[1] > 10000000, "（参考）1本線のままなら1,041万円の偽の急落が出ていた", "");
ok(T.series[0].values[0] < T.series[0].values[1], "★SBI線は増えている＝急落に見えない", "");
// 古い形式（口座別の内訳が無い data.json）でも線が消えない
const OLD = { eco: { asOf: "2026-08-16", rows: [], history: [
  { date: "2026-08-13", total: 13000000, level: "class", rows: 4 },
  { date: "2026-08-16", total: 13704370, level: "class", rows: 5 }] } };
eq(computeEcoTrend(OLD).ok, "true", "★口座別の内訳が無い古いdata.jsonでも線は引ける");
eq(computeEcoTrend(OLD).byAccount, "false", "古い形式だと分かる");
eq(computeEcoTrend({ eco: {} }).ok, "false", "記録が無ければ線は引かない");

console.log("\n【要件6】アプリ側の法人メーター");
const DC = mkData(WITH_CORP);
const meter = ecoCorpMeter(DC);
eq(fmtYen(meter.latest.amount), "¥45,000,000", "★法人メーターは独立して出る");
eq(ecoCard(DC).total, 23600000, "★家画面の経済カードに法人は入っていない");
eq(computeEcoTrend(DC).series[2].last, 23600000, "★合計線にも法人は入っていない");
eq(wtEcoTotal(DC), 23600000, "★目標×差分の「総資産」にも法人は入らない");
eq(ecoCorpMeter({ eco: {} }).latest, null, "法人の記録が無ければ「データ待ち」");
eq(ecoCorpMeter({ eco: {} }).known, "false", "古いdata.jsonでも落ちない");

console.log("\n【④】仕事タブの今月の新規登録");
eq(wkMonthNew({ udemyMonthly: U.monthly }).n, 27, "★台帳の「月間登録」列をそのまま出す");
eq(wkMonthNew({ udemyMonthly: U.monthly }).asOf, "2026-08-18", "いつ時点の実測かを併記できる");
eq(wkMonthNew({ udemyMonthly: [{ ym: "2026-05", officialNew: null, newEnroll: 900,
                                 from: "2026-04-20", to: "2026-05-30" }] }).n, null,
   "★列が無い月は「—」（累計の差は別に持つ）");
eq(wkMonthNew({ udemyMonthly: [{ ym: "2026-05", officialNew: null, newEnroll: 900 }] }).calc, 900,
   "そのとき累計の差を控えとして持つ");
eq(wkMonthNew({}), null, "月次が無くても落ちない");

console.log("\n【画面の配線】");
has(html, "const ep=ecoCard(DATA);", "★家画面の経済カードが ecoCard に配線されている");
ok(!/setRoom\('eco',\s*'\$'/.test(html), "★家画面の経済カードから $ 表記が消えている", "まだ$表記が残っている");
has(html, "setRoom('work', fmtInt(e0)+'人'", "★仕事カードは触っていない（Udemy累計登録のまま）");
has(html, 'id="corpCard"', "経済タブに法人メーターの独立カードがある");
has(html, 'id="ecoLegend"', "推移グラフに凡例がある");
has(html, "function toggleEcoSeries", "凡例タップで線のON/OFFができる");
has(html, 'id="v-mnew"', "仕事タブに今月の新規登録がある");

console.log("\n【実データ】いま公開中の data.json を素通しして落ちないか");
const real = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));
const rc = ecoCard(real), rt = computeEcoTrend(real), rm = ecoCorpMeter(real), rw = ecoWarn(real);
console.log("   形式 v" + real.version + " ／ 経済カード " + fmtYen(rc.total) + "（" + (rc.asOf || "—") + "）");
console.log("   推移: " + (rt.ok ? rt.series.map(s => s.label + " " + s.count + "点").join(" / ") : rt.reason));
console.log("   法人メーター: " + (rm.latest ? fmtYen(rm.latest.amount) : "データ待ち") +
            " ／ 経済の警告 " + rw.all.length + "件");
console.log("   今月の新規登録: " + JSON.stringify(wkMonthNew(real)));
ok(!!rc && !!rt && !!rm && !!rw, "実データでも形がそろっている");

console.log(fail ? "\n❌ " + fail + "件 失敗\n" : "\n全ケース合格 ✅\n");
process.exit(fail ? 1 : 0);
