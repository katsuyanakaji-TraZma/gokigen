/**
 * v1.5 経済の二階建て・3系列・ホワイトリスト・月間サニティのテスト
 *   （node tools/test/test-eco2.js）
 *
 * 正本: Drive「経済の部屋・観測定義書_v2確定版_2026-08-18」（📮_Claude納品箱）
 *
 * 確かめること（本人が出した修理6点にそのまま対応）：
 *   ①【要件1】UdemyのコースIDは C01〜C10 だけを取り込み、「全体」等は警告つきで無視する
 *   ②【要件2】項目名に「合計／総額／My資産」が入る行は小計扱いで item の合算から外す
 *   ③【要件3】月間サニティ（Udemy は目安超え／経済 同一日の合算と総括行の乖離5%超）
 *      ※ Udemyの目安は v1.6（2026-08-22）で 1,500 → 1,800 に引き上げた。
 *        しきい値そのもののテストは tools/test/test-dining.js にある。
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
eval(pickGs("/** その日その口座ぶんの残高", "// ===== v1.4: WANT台帳"));

/* ---------- ①【要件1】コースIDのホワイトリスト ---------- */
/* ===== v1.9：繰越方式 ===== */
console.log("\n【v1.9】繰越方式（記帳のない口座は前回の値を持ち越す）");
{
  const R = (date, account, amount) =>
    ({ date, account, name: account + "計", cat: "資産クラス", level: "class", amount });
  /* 本人の記帳のしかたそのまま：SBIは毎回送るが、貴金属と銀行はときどきしか送らない。
     これまでは送らない日に総資産が減って見えていた。 */
  const H = ecoHistory_([
    R("2026-08-16", "sbi", 13100000), R("2026-08-16", "gold", 590000),
    R("2026-08-18", "sbi", 13000000),                       // 貴金属を送らない日
    R("2026-08-20", "nomura", 11000000),
    R("2026-08-23", "sbi", 13200000), R("2026-08-23", "bank", 7270000)
  ]);
  eq(H.length, 4, "記録日は4日");
  /* v1.9.2【後ろ向き埋め】野村（初回8/20）と銀行（初回8/23）は、初回より前も
     初回の値で埋まる。だから最初の日からもう4口座ぶんが乗っている。 */
  eq(H[0].total, 13100000 + 590000 + 11000000 + 7270000, "★8/16から4口座ぶん（初回より前は初回の値で補う）");
  eq(H[1].total, H[0].total - 100000, "★8/18の増減はSBIの実際の増減だけ（貴金属59万は消えない）");
  ok(H[1].total > 13000000, "★送らなかった日に総資産が「SBIだけ」に減っていない", String(H[1].total));
  eq(H[1].gold, 590000, "★貴金属の値は8/16のまま");
  eq(H[1].goldAt, "2026-08-16", "その値をいつ記帳したかも持っている");
  eq(H[0].kind.nomura + "/" + H[0].kind.bank, "back/back", "★8/16の野村と銀行は推定（初回より前）");
  eq(H[2].total, H[1].total, "★8/20に野村を初記帳しても段差が出ない（同じ額で埋まっていたから）");
  eq(H[2].kind.nomura, "posted", "8/20は野村の初記帳");
  eq(H[3].total, 13200000 + 590000 + 11000000 + 7270000, "8/23は 1320+59+1100+727万");
  eq(H[3].complete, "true", "4口座そろった");
  eq(H[0].complete, "true", "★埋めたので8/16の時点でも4口座そろっている");
  // 実記帳した口座のリスト
  eq(H[0].posted.join(","), "gold,sbi", "★8/16に実記帳したのは 貴金属とSBI");
  eq(H[1].posted.join(","), "sbi", "★8/18に実記帳したのは SBI だけ");
  eq(H[1].carried.join(","), "gold", "★8/18は貴金属が持ち越し");
  eq(H[2].posted.join(","), "nomura", "8/20は野村だけ");
  eq(H[2].carried.join(","), "gold,sbi", "★8/20はSBIと貴金属が持ち越し（並びは口座名順）");
  eq(H[3].posted.join(","), "bank,sbi", "8/23はSBIと銀行");
  eq(H[3].carried.join(","), "gold,nomura", "8/23は貴金属と野村が持ち越し");
  eq(H[1].postedTotal, 13000000, "★その日に記帳したぶんだけの合計も持つ（総括行との突合に使う）");

  console.log("\n【v1.9】鮮度（14日を超えたら stale）");
  const A = ecoAccountsState_(H, "2026-08-23");
  eq(A.length, 4, "口座マスタは4つ固定");
  eq(A.map(a => a.key).join(","), "sbi,gold,nomura,bank", "並びも固定");
  eq(A[0].amount + "/" + A[0].asOf + "/" + A[0].days, "13200000/2026-08-23/0", "SBIメインは当日");
  eq(A[1].amount + "/" + A[1].asOf + "/" + A[1].days, "590000/2026-08-16/7", "★貴金属は7日前の値");
  eq(A[1].stale, "false", "7日ならまだ stale ではない");
  eq(A[2].days, 3, "野村は3日前");
  eq(A[3].days, 0, "銀行は当日");
  // 14日を超えたら stale
  const A2 = ecoAccountsState_(H, "2026-08-31");
  eq(A2[1].days, 15, "★貴金属は8/31時点で15日前");
  eq(A2[1].stale, "true", "★14日を超えたので stale＝true");
  eq(A2[0].stale, "false", "8日のSBIはまだ false");
  const A3 = ecoAccountsState_(H, "2026-08-30");
  eq(A3[1].days + "/" + A3[1].stale, "14/false", "★ちょうど14日は stale ではない（超えたら、なので）");
  // 一度も記帳の無い口座
  const H1 = ecoHistory_([R("2026-08-16", "sbi", 100)]);
  const A4 = ecoAccountsState_(H1, "2026-08-16");
  eq(A4[1].known + "/" + A4[1].amount, "false/null", "★一度も記帳が無い口座は known:false（合計に入れない）");
  eq(H1[0].total, 100, "合計は記帳のあるぶんだけ");
  eq(ecoHistory_([]).length, 0, "記録が無くても落ちない");
  // 法人は繰越にも合計にも入らない
  const H2 = ecoHistory_([R("2026-08-16", "sbi", 100),
                          { date: "2026-08-16", account: "corp", name: "法人現金", cat: "法人",
                            level: "class", amount: 74240000 }]);
  eq(H2[0].total, 100, "★法人は個人の繰越合計に1円も入らない");
}

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
/* v1.9.2【後ろ向き埋め】8/13は貴金属の初記帳（8/16）より前なので、
   その値 599,473 で埋まる。銀行はこの3日ぶんの台帳にまだ一度も出てこないので入らない。 */
eq(H[0].total, 24122431 + 599473, "★8/13は 届いた2口座 ＋ 初回より前を埋めた貴金属");
eq(H[0].kind.gold + "/" + H[0].goldAt, "back/2026-08-16", "8/13の貴金属は推定（8/16の値）");
eq(H[0].postedTotal, 24122431, "その日に記帳したぶんだけの合計は、届いた2口座のまま");
eq(H[1].date + " sbi=" + H[1].sbi, "2026-08-16 sbi=13104897",
   "★8/16 SBIメインは資産クラス4行だけを足して台帳の「SBI証券口座 合計」と一致");
eq(H[1].gold, 599473, "★8/16 貴金属は別口座として分かれる");
/* v1.9【繰越方式】8/16は「その日の証券+貴金属 13,704,370」に、
   8/13に記帳した野村 11,053,904 が持ち越されて乗る。これが本人の実際の総資産。 */
eq(H[1].total, 13704370 + 11053904, "★8/16は 証券+貴金属 に 8/13の野村が持ち越されて乗る");
eq(H[1].sbi + H[1].gold, 13704370, "その日に記帳した証券+貴金属ぶんは台帳どおり");
eq(H[1].nomura + "/" + H[1].nomuraAt, "11053904/2026-08-13", "★野村は8/13の値を持ち越し");
eq(H[2].date + " sbi=" + H[2].sbi, "2026-08-18 sbi=13094607",
   "★8/18 SBIメイン＝13,094,607円（個別行の合算＝Udemy収益ではない）");
eq(H[2].nomura, 11053904, "★8/18も野村は8/13の値のまま（記録が無い＝ゼロ、ではない）");
eq(H[2].carried.indexOf("nomura") >= 0, "true", "8/18の野村は持ち越しと分かる");
eq(H.filter(p => p.complete).length, 0,
   "★4口座が揃った日はまだ無い＝合計線は点なし（偽の急落を作らない）");
eq(H[1].posted.join(","), "gold,sbi", "★その日に**実記帳した**口座が分かる（点を濃く描くのに使う）");
eq(H[1].accounts.join(","), "gold,nomura,sbi", "accounts は合計に入っている口座（持ち越し・推定を含む）");

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
/* v1.9.2：埋めたので「揃っていない日」はもう無い。complete はどの日も true になり、
   合計線は記録日ぶん全部に点が打たれる（4口座待ちの考え方そのものを廃止した）。 */
eq(H2.filter(p => p.complete).length, H2.length, "★埋めたのでどの日も4口座そろっている");

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
// v1.6（2026-08-22）で目安が 1,500 → 1,800 になったので、1,684人は「正当な増加」＝警告なし
let wMid = buildWarnings_(LED, [], "2026-08-18",
  [{ ym: "2026-08", officialNew: 1684, newEnroll: 1684, to: "2026-08-18" }]);
eq(wMid.filter(x => x.kind === "monthSanity").length, 0,
   "★1,684人では警告なし（v1.6で目安を1,800に上げた）");
const M_NG = [{ ym: "2026-08", officialNew: 1984, newEnroll: 1984, to: "2026-08-18" }];
let w2 = buildWarnings_(LED, [], "2026-08-18", M_NG);
eq(w2.filter(x => x.kind === "monthSanity").length, 1, "★目安（1,800人）超で「二重計上疑い」の警告");
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

/* v1.9.1：推移の説明文は renderEcoTrend の中で組み立てている（DOMに触るので eval できない）。
   同じ組み立てをここで再現して、「n点・繰越方式」の形になっているかだけを確かめる。 */
/* v1.9.2：説明文のうち「初回記帳より前は…（点線）」の一行が出るかを確かめる。
   renderEcoTrend はDOMに触るので eval できないため、条件だけを再現する。 */
const pageNote = t => (t.carry
  ? "記帳のない口座は前回の値を持ち越しています。濃い点がその日に記帳した口座、薄い点は持ち越しです。" +
    (t.hasBack ? "初回記帳より前は初回の値で補っています（点線）。" : "")
  : "");
const index_note_of = t => {
  const how = t.carry ? "・繰越方式" : "";
  return t.series.map(sp => sp.count >= 2
    ? sp.label + "線は" + fmtYen(sp.first) + "→" + fmtYen(sp.last) + "（" + sp.count + "点" + how + "）"
    : sp.label + "線").join("／");
};

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
// v1.9.1：87歳の声が読む総資産（ckEcoTotal / ckVoiceEco）も同じ数字か確かめる
eval(leak(pickHtml("/* v1.9.1：87歳の声が読む総資産も", "function ckVoice(D,room){")));

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

console.log("\n【要件4】家画面の経済カード（円・カンマ区切り／v1.9：前回比は繰越合計の直近2点）");
const D = mkData(ALL);
const card = ecoCard(D);
/* v1.9【繰越方式】8/18はSBIしか記帳が無いが、貴金属と野村は前回の値を持ち越している。
   カードに出るのは「そのとき本人が持っている額」＝繰越合計。 */
eq(fmtYen(card.total), "¥24,747,984", "★カードの値は繰越した個人資産合計を円で（$192,538ではない）");
eq(card.asOf, "2026-08-18", "基準日は台帳の最新の記録日");
eq(card.carry, "true", "★繰越方式の data.json だと分かる");
eq(card.delta, -10290, "★前回比は繰越合計の直近2点の差（SBIの実際の増減だけが出る）");
eq(card.from, "2026-08-16", "どの日と比べたかを持つ");
has(card.deltaText, "前回比", "画面に出す文");
eq(ecoMissing(card.accounts).join("・"), "個人銀行", "★まだ一度も記帳の無い口座が言える");
// 記帳の無い日をはさんでも、前回比は繰越合計どうしで出る
const SAME = ALL.concat(mk("2026-08-20", [
  ["SBI 米国株式", "資産クラス", 6000000, "SBIメイン"],
  ["SBI 預り金(円)", "資産クラス", 7194607, "SBIメイン"]
], "x"));
const card2 = ecoCard(mkData(SAME));
eq(card2.total, 24847984, "最新の繰越合計");
eq(card2.delta, 100000, "★SBIが10万増えたぶんだけが前回比に出る（貴金属・野村は持ち越し）");
eq(card2.from, "2026-08-18", "どの日と比べたかを持つ");
eq(signedYen(card2.delta), "+¥100,000", "前回比も円・カンマ区切り");
eq(fmtYen(0), "¥0", "0円でも落ちない");
eq(ecoCard({ eco: {} }).total, null, "経済台帳が空でも落ちない");
// 口座別の内訳を持たない古い data.json では、前回比を出さない（偽の減少を出さないため）
const OLDH = { eco: { asOf: "2026-08-18", rows: [], history: [
  { date: "2026-08-13", total: 24122431, level: "item", rows: 8 },
  { date: "2026-08-16", total: 13704370, level: "class", rows: 5 },
  { date: "2026-08-18", total: 13094607, level: "item", rows: 20 }] } };
eq(ecoCard(OLDH).total, 13094607, "古いdata.jsonでも個人資産合計は出る");
eq(ecoCard(OLDH).delta, null,
   "★古い形式では前回比を出さない（8/16との差 −609,763円は偽の減少）");
has(ecoCard(OLDH).deltaText, "次の更新から", "いつ出るようになるかを画面に書く");

console.log("\n【要件5】アプリ側の系列（v1.9：合計線＋口座別4線）");
const T = computeEcoTrend(D);
eq(T.series.map(s => s.label).join(","), "合計,SBIメイン,貴金属,野村,銀行", "★凡例は5つ");
eq(T.series.map(s => s.color).join(","), "#ffb800,#4a7eff,#ff6b35,#22c77a,#9b59ff", "★5色そろっている");
eq(T.carry, "true", "★繰越方式だと分かる");
const S = {}; T.series.forEach(x => S[x.key] = x);
eq(S.sbi.values.join(","), "13068527,13104897,13094607", "★SBI線は3日ぶんつながる（偽の急落なし）");
eq(S.nomura.values.join(","), "11053904,11053904,11053904",
   "★野村線は記録の無い日も前回の値のまま（線が途切れない・ゼロに落ちない）");
eq(S.total.values.filter(v => v != null).length, 3, "★合計線は毎日点が打てる（4口座待ちをやめた）");
eq(S.total.values[2], 24747984, "8/18の合計＝繰越した総資産");
// その日に実記帳したかどうか（点の濃さ）
eq(S.nomura.live.join(","), "true,false,false", "★野村は8/13だけ実記帳、あとは持ち越し（点を薄く）");
eq(S.sbi.live.join(","), "true,true,true", "SBIは毎日記帳している");
eq(T.ok, "true", "線は引ける");
// 8/13と8/16をそのまま1本の線にすると、野村1,105万円ぶんの偽の急落になる
const naive = [24122431, 13704370];
ok(naive[0] - naive[1] > 10000000, "（参考）1本線のままなら1,041万円の偽の急落が出ていた", "");
ok(S.sbi.values[0] < S.sbi.values[1], "★SBI線は増えている＝急落に見えない", "");
// 古い形式（口座別の内訳が無い data.json）でも線が消えない
const OLD = { eco: { asOf: "2026-08-16", rows: [], history: [
  { date: "2026-08-13", total: 13000000, level: "class", rows: 4 },
  { date: "2026-08-16", total: 13704370, level: "class", rows: 5 }] } };
eq(computeEcoTrend(OLD).ok, "true", "★口座別の内訳が無い古いdata.jsonでも線は引ける");
eq(computeEcoTrend(OLD).byAccount, "false", "古い形式だと分かる");
eq(computeEcoTrend({ eco: {} }).ok, "false", "記録が無ければ線は引かない");

/* ===== v1.9.2：後ろ向き埋め（初回記帳より前は初回の値で補う） ===== */
console.log("\n【v1.9.2】初回記帳より前も埋めて、合計線の段差を消す");
{
  const R = (date, account, amount) =>
    ({ date, account, name: account + "計", cat: "資産クラス", level: "class", amount });
  /* 本番と同じ形：銀行の初記帳が8/21、貴金属の初記帳が8/16。
     埋める前は 8/20→8/21 で銀行の約727万がまるごと段差になっていた。 */
  const SRC = [
    R("2026-08-13", "sbi", 13068527), R("2026-08-13", "nomura", 11053904),
    R("2026-08-16", "sbi", 13104897), R("2026-08-16", "gold", 599473),
    R("2026-08-18", "sbi", 13094607),
    R("2026-08-20", "sbi", 13181163), R("2026-08-20", "nomura", 11073377),
    R("2026-08-21", "sbi", 13148496), R("2026-08-21", "gold", 619525),
    R("2026-08-21", "nomura", 11100000), R("2026-08-21", "bank", 7265348),
    R("2026-08-23", "sbi", 13497852), R("2026-08-23", "nomura", 11119197)
  ];
  logs.length = 0;
  const H = ecoHistory_(SRC);

  console.log("\n  kind（記帳／持ち越し／推定）が正しく付く");
  eq(H[0].kind.bank, "back", "★8/13の銀行は推定（初回8/21より前）");
  eq(H[0].bank + "/" + H[0].bankAt, "7265348/2026-08-21", "★埋めた値は初回8/21の値");
  eq(H[0].kind.gold, "back", "★8/13の貴金属も推定（初回8/16より前）");
  eq(H[0].gold, 599473, "貴金属は8/16の値で埋める");
  eq(H[0].kind.sbi + "/" + H[0].kind.nomura, "posted/posted", "8/13に記帳したSBIと野村は posted");
  eq(H[0].back.join(","), "bank,gold", "★8/13の推定は銀行と貴金属");
  eq(H[1].kind.gold, "posted", "8/16は貴金属を初記帳したので posted");
  eq(H[1].kind.nomura, "carry", "★8/16の野村は持ち越し");
  eq(H[1].back.join(","), "bank", "8/16の推定は銀行だけ");
  eq(H[2].kind.sbi + "/" + H[2].kind.gold + "/" + H[2].kind.bank, "posted/carry/back",
     "★8/18は 記帳／持ち越し／推定 が1点に同居する");
  eq(H[4].back.length, 0, "★8/21で銀行が初記帳されたので、そこから先に推定は無い");
  eq(H[4].posted.join(","), "bank,gold,nomura,sbi", "8/21は4口座そろって記帳");
  eq(H[5].kind.bank, "carry", "8/23の銀行は持ち越し（推定ではない）");
  eq(H.every(p => p.accounts.join(",") === "bank,gold,nomura,sbi"), "true",
     "★どの日も4口座そろっている（埋めたので）");

  console.log("\n  ログに後ろ向き埋めの中身を出す");
  ok(logs.some(l => /後ろ向き埋め: SBI貴金属 8\/13（8\/16の値）・個人銀行 8\/13〜8\/20（8\/21の値）/.test(l)),
     "★「後ろ向き埋め: 銀行 8/13〜8/20（8/21の値）…」の形で出る", logs.join(" / "));
  logs.length = 0;
  ecoHistory_([R("2026-08-13", "sbi", 100), R("2026-08-13", "gold", 1),
               R("2026-08-13", "nomura", 1), R("2026-08-13", "bank", 1),
               R("2026-08-16", "sbi", 200)]);
  ok(logs.some(l => /後ろ向き埋め: なし/.test(l)), "初日から全部そろっていれば「なし」", logs.join(" / "));

  console.log("\n  合計線に段差が出ない（増減は実記帳ぶんだけ）");
  const diffs = H.slice(1).map((p, i) => p.total - H[i].total);
  console.log("   日次の増減: " + diffs.map(d => d.toLocaleString()).join(" / "));
  /* その日に記帳した口座の、実際の増減の合計。これを超える動きが出たら段差。 */
  const realMove = H.slice(1).map((p, i) => {
    const prev = H[i];
    return p.posted.reduce((a, k) => a + Math.abs(p[k] - prev[k]), 0);
  });
  diffs.forEach((d, i) => ok(Math.abs(d) <= realMove[i] + 1,
    "★" + H[i + 1].date + " の増減は実記帳の差分の範囲内（段差なし）",
    "増減 " + d + " > 実記帳の動き " + realMove[i]));
  ok(Math.max.apply(null, diffs.map(Math.abs)) < 1000000,
     "★どの日も100万円を超える段差が出ない（埋める前は約727万の段差があった）",
     "最大 " + Math.max.apply(null, diffs.map(Math.abs)));
  // 埋めなかった場合との比較（8/21に銀行が丸ごと乗る段差）
  const noFill = 7265348;
  ok(diffs[3] < noFill / 10, "★8/21の段差が銀行まるごと（約727万）ではなくなっている", String(diffs[3]));

  console.log("\n  アプリ側：推定の点は薄く・点線");
  const D92 = { eco: { asOf: "2026-08-23", history: H, carryForward: true,
                       total: H[H.length - 1].total, rows: [] } };
  const T92 = computeEcoTrend(D92);
  eq(T92.hasBack, "true", "★推定を含むと分かる（説明文の「点線」の一行を出す条件）");
  const gs2 = T92.series.filter(x => x.key === "gold")[0];
  eq(gs2.back.join(","), "true,false,false,false,false,false", "★貴金属は8/13だけ推定");
  const bs2 = T92.series.filter(x => x.key === "bank")[0];
  eq(bs2.back.join(","), "true,true,true,true,false,false", "★銀行は8/13〜8/20が推定");
  const ts2 = T92.series.filter(x => x.key === "total")[0];
  eq(ts2.back.join(","), "true,true,true,true,false,false",
     "★合計線も、推定が混じる日は推定あつかい（点線でつなぐ）");
  eq(ts2.count, H.length, "合計線の点は記録日ぶん全部");
  eq(ts2.last, H[H.length - 1].total, "最後の点は eco.total と一致");
  has(pageNote(T92), "点線", "★説明文に点線のことを書く");
}

/* ===== v1.9.1：金額の出どころが1つになっているか ===== */
console.log("\n【v1.9.1】画面に出る個人資産の金額は、すべて eco.total と一致する");
{
  /* 本番と同じ形：いちばん新しい記録日にはSBIと野村しか記帳が無く、
     貴金属と銀行は数日前の値を持ち越している。
     ここで「記帳日だけの合計」を読んでしまう箇所が1つでも残っていると、
     87歳の声だけが小さい額を言う——という v1.9 のバグが再発する。 */
  const R = (date, account, amount) =>
    ({ date, account, name: account + "計", cat: "資産クラス", level: "class", amount });
  const src = [
    R("2026-08-21", "sbi", 13300000), R("2026-08-21", "gold", 619525),
    R("2026-08-21", "nomura", 11100000), R("2026-08-21", "bank", 7265348),
    R("2026-08-23", "sbi", 13497852), R("2026-08-23", "nomura", 11119197)   // 貴金属・銀行は持ち越し
  ];
  const hist = ecoHistory_(src);
  const accs = ecoAccountsState_(hist, "2026-08-23");
  const D9 = { eco: { asOf: "2026-08-23", history: hist, accounts: accs, carryForward: true,
                      total: hist[hist.length - 1].total,
                      rows: src.filter(r => r.date === "2026-08-23") } };
  const TOTAL = 13497852 + 619525 + 11119197 + 7265348;      // = 32,501,922
  eq(D9.eco.total, TOTAL, "繰越合計は4口座の最新値の合計");
  const posted = 13497852 + 11119197;                        // 記帳日だけの合計（読んではいけない方）
  ok(posted !== TOTAL, "★2つの数字はちゃんと食い違っている（テストの前提）", "");

  // 画面に金額を出している関数を、ぜんぶ並べて突き合わせる
  const sites = {
    "家画面の経済カード": ecoCard(D9).total,
    "経済の部屋の総資産": ecoTotal(D9),
    "87歳の声":          ckEcoTotal(D9),
    "目標×差分の総資産":  wtEcoTotal(D9),
    "推移グラフの合計線の最後": computeEcoTrend(D9).series.filter(x => x.key === "total")[0].last
  };
  Object.keys(sites).forEach(function (k) {
    eq(sites[k], TOTAL, "★" + k + " が eco.total と一致");
  });
  ok(Object.keys(sites).every(k => sites[k] !== posted),
     "★どこも「記帳日だけの合計」を読んでいない", JSON.stringify(sites));
  // 口座4行の合計も同じ
  eq(accs.reduce((a, x) => a + (x.amount || 0), 0), TOTAL, "★口座4行の合計も eco.total と一致");
  // 87歳の声の文言
  has(ckVoiceEco(D9).text, fmtYen(TOTAL), "★87歳の声の金額も同じ");
  has(ckVoiceEco(D9).text, "（個人4口座・繰越）", "★87歳の声は「個人4口座・繰越」と言う");
  // legacy は名前で分かるようにしてあり、繰越の data.json では使われない
  ok(ecoLegacyRowSum(D9) !== TOTAL, "★legacy（記帳日だけの合計）は別物", String(ecoLegacyRowSum(D9)));
  eq(ecoIsCarry(D9), "true", "繰越方式だと分かる");
  eq(ecoIsCarry({ eco: { history: [{ date: "2026-08-16", total: 100 }] } }), "false", "古い形式は false");

  console.log("\n【v1.9.1】合計線の点の数 ＝ history の件数");
  const T9 = computeEcoTrend(D9);
  const tot9 = T9.series.filter(x => x.key === "total")[0];
  eq(tot9.count, hist.length, "★合計線の点は記録日ぶん全部（4口座待ちをやめた）");
  eq(tot9.values.filter(v => v != null).length, hist.length, "空の点が無い");
  eq(T9.labels.length, hist.length, "横軸も記録日ぶん");
  eq(T9.series.length, 5, "合計線＋口座別4線");
  eq(T9.series.map(x => x.key).join(","), "total,sbi,gold,nomura,bank", "並びも決まっている");
  // 口座別の線も、持ち越しの日を含めて全記録日ぶん点がある
  T9.series.forEach(function (sp) {
    eq(sp.count, hist.length, sp.label + "線も記録日ぶん全部（持ち越しで途切れない）");
  });
  // 実記帳か持ち越しかが分かる（点の濃さ）
  eq(tot9.live.join(","), "true,true", "合計線はどの日も記帳がある");
  eq(T9.series.filter(x => x.key === "gold")[0].live.join(","), "true,false",
     "★貴金属は8/23が持ち越し（点を薄く描く）");
  has(index_note_of(T9), "繰越方式", "★推移の説明文に「繰越方式」と書く");
}

console.log("\n【要件6】アプリ側の法人メーター");
const DC = mkData(WITH_CORP);
const meter = ecoCorpMeter(DC);
eq(fmtYen(meter.latest.amount), "¥45,000,000", "★法人メーターは独立して出る");
eq(ecoCard(DC).total, 23600000, "★家画面の経済カードに法人は入っていない");
eq(computeEcoTrend(DC).series.filter(x => x.key === "total")[0].last, 23600000,
   "★合計線にも法人は入っていない");
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

console.log("\n【2026-08-18 追加】法人メーターの空表示は「未記帳」（仮の数字を出さない）");
eq(nextStocktake("2026-08-18"), "2026-08-22", "★棚卸しは毎月第4土曜。8/18の次は 8/22");
eq(nextStocktake("2026-08-22"), "2026-08-22", "当日はその日を指す");
eq(nextStocktake("2026-08-23"), "2026-09-26", "★過ぎたら翌月の第4土曜（9/26）");
eq(nextStocktake("2026-09-01"), "2026-09-26", "月初でもその月の第4土曜");
eq(nextStocktake("2026-12-27"), "2027-01-23", "★年をまたいでも落ちない");
eq(nextStocktake("2026-02-01"), "2026-02-28", "2月（第4土曜が末日）");
ok(!/4[,]?800[,]?0000?|46800000/.test(html),
   "★確認用にでっち上げた金額（¥46,800,000）がアプリに1件も残っていない", "残っている");
has(html, "未記帳", "空表示は「未記帳」と書く");
has(html, "の棚卸しで初記帳予定", "いつ初記帳するかを書く");
ok(!/法人.{0,40}(見込|概算|仮)/.test(html), "法人に見込み額・概算を書いていない", "書いてある");

console.log("\n【2026-08-18 追加】本人メモは法人メーターの中で、実測が入るまでだけ出す");
eq(corpMemoVisible({ eco: {} }), "true", "★実測がまだ無いうちは本人メモを出す");
eq(corpMemoVisible(mkData(ALL)), "true", "法人の行が1件も無ければ出す");
eq(corpMemoVisible(mkData(WITH_CORP)), "false",
   "★区分「法人」の実測行が入った月以降は、本人メモを自動で消す");
ok(!/<div class="note">会社の現金/.test(html),
   "★経済タブ末尾の固定メモ（出どころ不明の金額）は無くなっている", "まだ残っている");
const iCorpCard = html.indexOf('id="corpCard"'), iMemo = html.indexOf('id="corpMemo"');
const iTrend = html.indexOf('id="ecoTrendCard"');
ok(iCorpCard < iMemo && iMemo < iTrend, "★本人メモは法人メーターカードの中にある",
   iCorpCard + "/" + iMemo + "/" + iTrend);
has(html, "📝本人メモ（実測前の感覚値・2026/8月時点）", "実測値でないことを明示している");
has(html, "会社の現金4,000〜5,000万円", "メモの中身は消さずに残している");

console.log("\n【2026-08-18 追加】Udemyの累計収益は仕事タブへ");
const iWork = html.indexOf('id="pg-work"'), iEco = html.indexOf('id="pg-eco"');
const iRev = html.indexOf('id="v-rev"'), iTbl = html.indexOf('id="revTable"');
ok(iWork < iRev && iRev < iEco, "★「Udemy 累計収益」は仕事タブの中にある", iWork+"/"+iRev+"/"+iEco);
ok(iWork < iTbl && iTbl < iEco, "★「コース別 累計収益」も仕事タブの中にある", iWork+"/"+iTbl+"/"+iEco);
ok(html.indexOf('id="ecoTrendCard"') > iEco, "個人資産の推移は経済タブに残っている", "");
ok(html.indexOf('id="corpCard"') > iEco, "法人メーターは経済タブに残っている", "");
has(html, "function renderRevenue()", "収益の描画は renderRevenue に切り出した");
has(html, "  renderRevenue();", "renderWork から呼んでいる");
ok(!/id="ecoTable"|id="ecoAsOf"/.test(html), "経済タブ側の古いIDは残っていない", "残っている");

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
