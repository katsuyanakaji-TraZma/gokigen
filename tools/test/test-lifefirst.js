/**
 * v1.10 🌱人生初（ver57.x ごと）＋ 🚗日帰り圏の列 のテスト
 *   （node tools/test/test-lifefirst.js）
 *
 * 確かめること：
 *   ①【GAS】ver の計算は selfVersion_ 一本（バナーの ver 表示とズレない）
 *   ②【GAS】🌱（種別「初めて」）を ver ごとに数える。「?」付きは数えない
 *   ③【GAS】180日で切る前に数える（半年たった ver の件数が勝手に減らない）
 *   ④【アプリ】先月比・記録の無い月・次の一手が言葉で出る
 *   ⑤【GAS+アプリ】🚗日帰り圏は台帳の○×が最優先、空欄なら地方からの推定
 */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "..");
const gs = fs.readFileSync(path.join(root, "tools", "update-data.gs"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const pageHtml = fs.readFileSync(path.join(root, "places.html"), "utf8");

let fail = 0;
const ok = (cond, name, detail) => {
  console.log((cond ? "✅ " : "❌ ") + name + (cond ? "" : "\n     " + detail));
  if (!cond) fail++;
};
const eq = (got, want, name) => ok(String(got) === String(want), name, "結果=" + got + "  期待=" + want);
const has = (hay, needle, name) => ok(String(hay).indexOf(needle) >= 0, name, "「" + needle + "」が無い");

/* ========== Apps Script 側 ========== */
const logs = [];
const Logger = { log: m => logs.push(String(m)) };
const Utilities = { formatDate: (d, tz, fmt) => {
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
} };
const pickGs = (a, b) => {
  const i = gs.indexOf(a), j = gs.indexOf(b);
  if (i < 0 || j < 0) throw new Error("update-data.gs に目印が見つかりません: " + (i < 0 ? a : b));
  return gs.slice(i, j);
};
eval(pickGs("var LIMITLESS_FOLDER_ID", "// ===== STEP1"));                 // CONFIG
eval(pickGs("// ===== v1.4: 自己バージョン", "// ===== 変換ヘルパー"));      // verKey_ / selfVersion_
eval(pickGs("var LIFE_FIRST_KIND", "/**\n * 知識の部屋にそのまま出す形"));   // buildLifeFirsts_

console.log("\n【要件1】ver の計算は selfVersion_ 一本");
eq(verKey_("2026-08-24"), "57.04", "★2026年8月は 57.04（バナーの ver57.04 と同じ）");
eq("ver" + verKey_("2026-08-24"), selfVersion_("2026-08-24").version, "★ver表示と必ず一致する");
eq(verKey_("2026-04-30"), "57.00", "誕生月は .00");
eq(verKey_("2026-05-01"), "57.01", "翌月は .01");
eq(verKey_("2027-03-31"), "57.11", "誕生月の前月は .11");
eq(verKey_("2027-04-01"), "58.00", "1年たつと整数部が上がる");
has(gs, "function verKey_(ds) { return selfVersion_(ds).version.replace(/^ver/, ''); }",
    "★verKey_ は selfVersion_ を呼ぶだけ（同じ計算を2つ書いていない）");

console.log("\n【要件2】🌱（種別「初めて」）を ver ごとに数える");
const R = (date, kinds, text, who) => ({ date, kinds, text, who: who || null });
const ROWS = [
  R("2026-05-02", ["初めて"], "初めてのサウナ"),
  R("2026-05-20", ["初めて", "トライ"], "初めてのゴルフコース"),          // タグ2つでも1件
  R("2026-06-10", ["初めて"], "初めての座禅"),
  R("2026-08-13", ["初めて"], "初の茶臼岳登山"),
  R("2026-08-20", ["初めて"], "初めてのドローン撮影", "アキさん"),
  R("2026-08-21", ["教え"], "大崎君にコーチング"),                        // 🌱ではない
  R("2026-08-22", [], "🌱初めて?（まだ決めかねている）")                   // 「?」付きは kinds に入らない
];
const LF = buildLifeFirsts_(ROWS);
eq(Object.keys(LF).sort().join(","), "57.01,57.02,57.04", "★verごとにまとまる（5月・6月・8月）");
eq(LF["57.04"].count, 2, "★8月（ver57.04）は2件");
eq(LF["57.01"].count, 2, "5月（ver57.01）は2件");
eq(LF["57.02"].count, 1, "6月（ver57.02）は1件");
eq(LF["57.04"].ver, "ver57.04", "ver の文字列も持つ");
eq(LF["57.04"].label, "2026年8月", "何月かも持つ");
eq(LF["57.04"].items[0].date, "2026-08-20", "★明細は新しい順");
eq(LF["57.04"].items[0].content, "初めてのドローン撮影", "内容");
eq(LF["57.04"].items[0].who, "アキさん", "関連も持つ");
eq(LF["57.04"].from + "〜" + LF["57.04"].to, "2026-08-13〜2026-08-20", "その月の最初と最後");
ok(!Object.keys(LF).some(k => LF[k].items.some(x => /決めかねている/.test(x.content))),
   "★「?」付きの種別は数えない（kinds に入らないので自動的に外れる）", JSON.stringify(LF));
ok(!Object.keys(LF).some(k => LF[k].items.some(x => /コーチング/.test(x.content))),
   "🌱でない行（教え）は入らない", "");
eq(Object.keys(buildLifeFirsts_([])).length, 0, "記録が無くても落ちない");
eq(Object.keys(buildLifeFirsts_(null)).length, 0, "null でも落ちない");
has(gs, "var lifeFirsts = buildLifeFirsts_(rows);",
    "★180日で切る**前**に数えている（古いverの件数が勝手に減らない）");
has(gs, "lifeFirsts: (limitless && limitless.lifeFirsts) || {}", "data.json に出している");

/* ========== アプリ側（index.html） ========== */
const leak = code => code.replace(/^(const|let|var) /gm, "var ");
const pickHtml = (a, b) => {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0) throw new Error("index.html に目印が見つかりません: " + (i < 0 ? a : b));
  return html.slice(i, j);
};
eval(leak(pickHtml("/* ===== util ===== */", "/* ===== state ===== */")));
eval(leak(pickHtml("/* ===== v1.4 目標×差分（WANT台帳）ここから =====", "/* ===== v1.4 目標×差分 ここまで ===== */")));
eval(leak(pickHtml("/* ===== v1.10 🌱人生初（ver57.x ごと）ここから =====", "/* ===== v1.10 🌱人生初 ここまで ===== */")));

console.log("\n【要件4】アプリ側：verの前後関係と表示");
eq(lfNowKey("2026-08-24"), "57.04", "★今日のverもアプリ側で同じ答え");
eq(lfNowKey("2026-08-24"), verKey_("2026-08-24"), "★Apps Script側と一致する");
eq(lfPrevKey("57.04"), "57.03", "1つ前のver");
eq(lfPrevKey("57.00"), "56.11", "★誕生月の1つ前は前の年の .11");
eq(lfVerLabel("57.04"), "2026年8月", "verから何月かを出す");
eq(lfVerLabel("57.00"), "2026年4月", "誕生月");
eq(lfVerLabel("57.11"), "2027年3月", "年をまたぐ");

const D = { lifeFirsts: LF };
const C = lfCard(D, "2026-08-24");
eq(C.now.count, 2, "今のver（57.04）は2件");
eq(C.now.ver, "ver57.04", "今のver");
eq(C.prev, "null", "★1つ前（57.03＝7月）は記録が無いので null");
eq(C.diff, "null", "比べる相手がいなければ先月比は出さない");
eq(C.total, 5, "ぜんぶで5件");
eq(C.trend.length, 5, "★誕生月(.00)から今のver(.04)まで5つ並ぶ");
eq(C.trend.map(x => x.count).join(","), "0,2,1,0,2", "★記録の無い月も0で並ぶ（4月0・5月2・6月1・7月0・8月2）");
eq(C.trend[4].now, "true", "いまのverに印が付く");
eq(C.known, "true", "記録がある");

console.log("\n【要件4】言葉化（件数で止めず、次の一手まで）");
// 先月より多い
const more = lfCard({ lifeFirsts: Object.assign({}, LF, { "57.03": { ver: "ver57.03", count: 1, items: [] } }) }, "2026-08-24");
eq(more.diff, 1, "先月比 +1件");
has(more.next, "1件多い", "★増えていればそう言う");
// 先月より少ない
const less = lfCard({ lifeFirsts: Object.assign({}, LF, { "57.03": { ver: "ver57.03", count: 8, items: [] } }) }, "2026-08-24");
eq(less.diff, -6, "先月比 −6件");
has(less.next, "あと6件で並びます", "★少なければ「あと何件で並ぶか」まで言う");
// 今月まだ0件
const zero = lfCard({ lifeFirsts: { "57.03": { ver: "ver57.03", count: 8, items: [] } } }, "2026-08-24");
eq(zero.now.count, 0, "今月0件");
has(zero.next, "まだ記録なし", "★0件の月は「まだ記録なし」と言う");
has(zero.next, "今日「初めて」を1つ作れば", "次の一手が出る");
// まだ1件も無い
const none = lfCard({}, "2026-08-24");
eq(none.known, "false", "台帳に🌱がまだ無い");
has(none.next, "朝の点呼で", "はじめ方を書く");
eq(lfCard({ lifeFirsts: {} }, "2026-08-24").trend.length, 5, "空でも並びは作れる");

console.log("\n【画面の配線】");
has(html, 'id="lfCard"', "★精神の部屋に🌱人生初カードがある");
has(html, "  renderLifeFirst();", "renderSpirit から呼んでいる");
has(html, "🌱 人生初", "カードの見出し");
const iSpirit = html.indexOf('id="pg-spirit"'), iLf = html.indexOf('id="lfCard"'),
      iPriv = html.indexOf('id="pg-priv"');
ok(iSpirit < iLf && iLf < iPriv, "★カードは精神の部屋の中にある", iSpirit + "/" + iLf + "/" + iPriv);
has(html, "ver別の積み上げを見る", "タップで月別一覧に展開する");

/* ========== 🚗日帰り圏の列 ========== */
console.log("\n【要件5】🚗日帰り圏は台帳の○×が最優先、空欄なら地方からの推定");
eval(pickGs("/* v1.10【🚗日帰り圏】", "/** 台帳のファイル。"));
eq(placesDayTripGuess_("関東・千葉"), "true", "関東は推定でtrue");
eq(placesDayTripGuess_("山梨・富士五湖"), "true", "山梨");
eq(placesDayTripGuess_("静岡・富士宮"), "true", "静岡");
eq(placesDayTripGuess_("東北・福島"), "true", "★東北は福島だけ");
eq(placesDayTripGuess_("東北・青森"), "false", "★青森は違う");
eq(placesDayTripGuess_("北海道"), "false", "北海道は違う");
eq(placesDayTripCell_("○"), "true", "★台帳の○はtrue");
eq(placesDayTripCell_("◯"), "true", "別の丸でも読む");
eq(placesDayTripCell_("×"), "false", "★台帳の×はfalse");
eq(placesDayTripCell_("TRUE"), "true", "TRUEでも読む");
eq(placesDayTripCell_(""), "null", "★空欄は null（＝推定に任せる）");
eq(placesDayTripCell_(null), "null", "null でも落ちない");
eq(placesDayTripCell_("わからない"), "null", "読めない書き方も推定に任せる");
has(gs, "function setupDayTripColumn()", "★列を作る関数がある（1回だけ手で実行する）");
has(gs, "if (cur != null) { kept++; continue; }", "★すでに○×のある行は上書きしない");
ok(gs.indexOf("setupDayTripColumn") > 0 && !/main\(\)[^]*setupDayTripColumn/.test(gs.slice(0, 6000)),
   "★自動実行（main）からは呼ばない＝runNowは読むだけのまま", "");

// アプリ側：台帳の値が推定より優先される
const leakP = code => code.replace(/^(const|let|var) /gm, "var ");
const pickP = (a, b) => {
  const i = pageHtml.indexOf(a), j = pageHtml.indexOf(b);
  return pageHtml.slice(i, j);
};
eval(leakP(pickP("/* v1.8：🚗日帰り圏。川口から車で日帰りできる範囲。", "/** 写真は「台帳の写真URLが最優先」")));
eq(plIsDayTrip({ area: "北海道", dayTrip: true }), "true",
   "★台帳で○なら、地方が北海道でも日帰り圏（本人の答えが勝つ）");
eq(plIsDayTrip({ area: "関東・千葉", dayTrip: false }), "false",
   "★台帳で×なら、関東でも日帰り圏にしない");
eq(plIsDayTrip({ area: "関東・千葉" }), "true", "列が無ければ地方から推定");
eq(plIsDayTrip({ area: "東北・青森" }), "false", "推定でfalse");
eq(plIsDayTrip({}), "false", "空でも落ちない");

console.log("\n【実データ】いま公開中の data.json");
const real = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));
const rc = lfCard(real);
console.log("   形式 v" + real.version + " ／ 🌱人生初 " + rc.total + "件（" +
            rc.now.ver + " は " + rc.now.count + "件）");
console.log("   次の一手: " + rc.next);
ok(!!rc && rc.trend.length > 0, "実データでも落ちない");

console.log(fail ? "\n❌ " + fail + "件 失敗\n" : "\n全ケース合格 ✅\n");
process.exit(fail ? 1 : 0);
