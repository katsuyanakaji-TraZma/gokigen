/**
 * v1.2.1 ホットフィックスのテスト（node tools/test/test-consolidate.js）
 *
 * 確かめること：
 *   PART1 未来ビジョン … DocumentApp を使わず、書き出した「ただの文章」から
 *                        部屋・はしご・採点軸を拾えるか（documentsスコープ無しで動く形か）
 *   PART2 統合         … ①GOKIGEN台帳をまとめても、まとめる前と同じ結果になるか
 *                        （ズレた行の扱い・ご機嫌度の5段階/10段階が崩れないか）
 *                        ②base は更新日時が新しくても必ず最初に読むか
 *                        ③同名Udemyログの「中身が同じ／違う」を見分けられるか
 *   PART3 経済台帳     … 新しい列（日付/区分/項目/評価額円）を読めるか、
 *                        「総括→資産クラス→個別銘柄」を3重に数えないか
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

const pick = (a, b) => {
  const i = gs.indexOf(a), j = gs.indexOf(b);
  if (i < 0 || j < 0) throw new Error("update-data.gs に目印が見つかりません: " + (i < 0 ? a : b));
  return gs.slice(i, j);
};

/* ===== Apps Script のかわりの道具 ===== */
const Logger = { log: () => {} };
const Utilities = {
  formatDate: (d, tz, fmt) => {
    const p = n => String(n).padStart(2, "0");
    if (fmt === "H:mm") return d.getHours() + ":" + p(d.getMinutes());
    if (fmt === "yyyy/M") return d.getFullYear() + "/" + (d.getMonth() + 1);
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
};
const Session = { getScriptTimeZone: () => "Asia/Tokyo" };

eval(pick("var LIMITLESS_FOLDER_ID", "// ===== STEP1"));
eval(pick("// ===== v1.2.1: 台帳の整理", "// 動作確認用：GitHubに書かず"));
eval(pick("// 妥当レンジの門番", "// ===== Udemy台帳（base + デルタの合算） ====="));
eval(pick("// ===== Udemy台帳（base + デルタの合算） =====", "// 今公開中の data.json"));
eval(pick("// ===== v1.2: base + デルタ形式の台帳を読む共通部品 =====", "// ===== 変換ヘルパー ====="));
eval(pick("// ===== 変換ヘルパー =====", "// ===== GitHub ====="));
// 未来ビジョンの読み取り部分（DocumentApp を使っていないこと自体も確かめる）
eval(pick("function futureSection_(t) {", "// ===== v1.2: base + デルタ形式の台帳を読む共通部品 ====="));

console.log("\n■ PART1: 未来ビジョン台帳（documentsスコープ無しで読む）");
// コメントの中の説明は数えず、実際に呼んでいる箇所だけを見る
const codeLines = gs.split("\n").filter(l => !/^\s*(\*|\/\/)/.test(l));
ok(codeLines.every(l => l.indexOf("DocumentApp") < 0),
   "★DocumentApp をどこからも呼んでいない（再承認が起きない）",
   "まだ呼んでいる行: " + codeLines.filter(l => l.indexOf("DocumentApp") >= 0).join(" / "));
has(gs, "export?mimeType=text/plain", "Drive の書き出し（export）で読んでいる");
has(gs, "ScriptApp.getOAuthToken()", "いまのトークンをそのまま使っている");
ok(/https:\/\/www\.googleapis\.com\/drive\/v3\/files/.test(gs), "Drive API v3 を叩いている", "URLが違う");

/* 本物の台帳（2026-08-13版）を text/plain で書き出したときの形。
   箇条書きは記号が付く場合と付かない場合の両方を混ぜてある。 */
const DOC_TEXT = [
  "未来ビジョン台帳（2026-08-13版・油絵v3）",
  "",
  "2026/8/13 ビジョンメイキング90分セッションの成果。半年ごとに見直して重ね塗りする。",
  "",
  "1. 87歳(2056年)の完成図 — 6つの部屋",
  "",
  "ピラミッド構造: 1階(精神・心/健康/知識・教養)が満ちて2階(仕事/家族・趣味)が立ち、3階(経済)が実る。健康が崩れると全てを失う。",
  "",
  "1階・健康(大黒柱)",
  "",
  "\t- 毎朝3〜5kmの散歩。足元ふらつかず、筋力があり、毎日行く場所がある",
  "\t- 方針: 体重減より「内臓脂肪を下げて筋肉量を上げる」。勝負は太もも・脚力",
  "",
  "1階・精神/心",
  "",
  "\t- おおらかで人に優しい「ギバー」",
  "\t- その目標設定装置=「百クラブ」: 低山100座、ゴルフ100切り、など楽しい100を持ち続ける",
  "",
  "1階・知識/教養",
  "",
  "\t- 最先端AIとの協働を学び続ける",
  "",
  "2階・仕事",
  "",
  "\t- 2030/4/29(60歳最後の日)にUdemy100・Kindle100完成 — これは「発電所」",
  "",
  "2階・家族/趣味",
  "",
  "\t- 子ども3人全員の結婚を願う。孫6〜7人",
  "",
  "3階・経済",
  "",
  "\t- 87歳の暮らし: 世間平均の3倍(月75万・年900万規模)で「十分にご機嫌」",
  "",
  "2. サブゴールのはしご(バックキャスト)",
  "",
  "\t- 87歳(2056): 上記完成図",
  "\t- 77歳(2046): 旅の10年を完走直後。海外100日旅→国内温泉・低山シフト",
  "\t- 72歳(2041): 旅の10年のど真ん中。脚は20kmウォーク級で維持",
  "\t- 67歳(2036): 旅の10年2〜3周目。完全資産型がほぼ完成",
  "\t- 62歳(2031): 100作品完成の翌年=「資産化工事」の年。100kmウォーク現役",
  "\t- 61歳最後の日(2030/4/29): Udemy100・Kindle100完成【既定の中間旗】",
  "\t- 原則: 最初の5年に最大の成長率、後ろの5年ほど控えめに。動けるうちに前倒し",
  "",
  "3. 経済の客観検証(速報版・2026/8/13)",
  "",
  "\t- 支出仮説: 平均の3倍=月75〜80万",
  "",
  "4. 週報への実装(87歳からのフィードバック)",
  "",
  "\t- 採点軸: 今週の行動は ①太もも・脚力(健康の大黒柱)に投資したか ②100作品の発電所建設を進めたか ③資産化工事を進めたか ④家族の楽しみを確定させたか ⑤生き生き・わくわく・どきどきがあったか",
  "\t- 口調: おおらかで優しいギバーの87歳が、もがきを笑って認めながら「動けるうちに前倒しだよ」と背中を押す"
].join("\n");

// readFuture_ の中身のうち、Driveに触る部分だけ差し替えて動かす
const readFutureBody = pick("function readFuture_() {", "// ===== v1.2: base + デルタ形式の台帳を読む共通部品 =====")
  .replace("var doc = findFutureDoc_();", "var doc = FAKE_DOC;")
  .replace("var docText = fetchDocText_(doc.getId());", "var docText = FAKE_TEXT;");
const FAKE_DOC = {
  getName: () => "未来ビジョン台帳_2026-08-13",
  getId: () => "docid",
  getUrl: () => "https://docs.google.com/document/d/docid/edit"
};
const FAKE_TEXT = DOC_TEXT;
eval(readFutureBody);
const F = readFuture_();

eq(Object.keys(F.rooms).length, 6, "★6つの部屋を全部拾える");
eq(F.rooms.health.heading, "1階・健康(大黒柱)", "健康の部屋の見出し");
eq(F.rooms.health.bullets.length, 2, "健康の部屋の箇条書き（記号は落として2件）");
eq(F.rooms.health.bullets[0], "毎朝3〜5kmの散歩。足元ふらつかず、筋力があり、毎日行く場所がある",
   "★箇条書きの「- 」やタブが落ちている");
eq(F.rooms.eco.bullets[0].indexOf("87歳の暮らし"), 0, "経済の部屋も拾える");
eq(F.ladder.length, 5, "★はしごは87→62の5段（61歳の旗は別扱い）");
eq(F.ladder.map(x => x.age).join(","), "87,77,72,67,62", "はしごは年齢の大きい順");
eq(F.ladder[0].year, 2056, "87歳は2056年");
eq(F.flag.date, "2030-4-29", "★中間旗（2030/4/29）を拾う");
eq(F.axes.length, 5, "★採点軸5つ");
has(F.axes[0], "太もも", "採点軸①は脚力");
has(F.tone, "前倒し", "口調も拾う");
eq(F.docTitle, "未来ビジョン台帳_2026-08-13", "ファイル名がタイトルになる");
eq(F.asOf, "2026-08-13", "台帳の日付");
// 「87歳(2056): 上記完成図」は完成図という語を含むが、章見出しではないので section を変えてはいけない
ok(F.ladder.length === 5, "はしごの途中で章が切り替わっていない", "はしごが途切れている");

console.log("\n■ PART2-①: GOKIGEN台帳をまとめても結果が変わらない");
/* 作り物：3本の日次ファイル。
   ・7/20 と 7/21 は普通の行
   ・7/22 の古いファイルには「列がズレた行」が入っている（体重欄に 4/5）
   ・ご機嫌度は5段階（4/5）と10段階（8）が混在 */
const HEAD = ["日付", "曜日", "体重", "体脂肪率", "筋肉量", "内臓脂肪", "体年齢",
  "血圧上", "血圧下", "ご機嫌度", "睡眠", "運動", "会食", "ルーティン", "一言"];
const FILES = [
  { name: "GOKIGEN_台帳_2026-07-21", t: 1, values: [HEAD,
      ["2026-07-20", "月", 84.2, 27.1, 55.0, 12, 61, 128, 82, "4/5", 78, "散歩3km", "なし", 80, "7/20の記録"],
      ["2026-07-21", "火", 84.0, 27.0, 55.1, 12, 61, 126, 80, 8, 80, "ジム", "客・大塚", 90, "7/21の記録"]] },
  { name: "GOKIGEN_台帳_2026-07-22", t: 2, values: [HEAD,
      // 列がズレた行（体重欄に 4/5 が入っている）。正しい行を上書きしてはいけない
      ["2026-07-21", "火", "4/5", 6, "長文がここに来てしまった", "", "", "", "", "", "", "", "", "", ""],
      ["2026-07-22", "水", 83.8, 26.9, 55.2, 11, 60, 124, 78, 9, 82, "ゴルフ", "なし", 100, "7/22の記録"]] },
  { name: "GOKIGEN_台帳_2026-08-01", t: 3, values: [HEAD,
      // 8月のファイルは7月の行も持っている（この行のほうが新しいので勝つ）
      ["2026-07-22", "水", 83.7, 26.9, 55.2, 11, 60, 124, 78, 9, 82, "ゴルフ", "なし", 100, "7/22の記録（訂正）"],
      ["2026-08-01", "土", 83.5, 26.5, 55.5, 11, 60, 122, 76, 10, 85, "散歩5km", "家族", 100, "8/1の記録"]] }
];
const sheetOf = values => ({
  getDataRange: () => ({ getValues: () => values }),
  getParent: () => ({ getSpreadsheetTimeZone: () => "Asia/Tokyo" })
});
// SpreadsheetApp.openById の代わり
const STORE = {};
FILES.forEach(f => { STORE[f.name] = f.values; });
global.SpreadsheetApp = {
  openById: id => ({ getSheets: () => [sheetOf(STORE[id])] }),
  flush: () => {}
};
const fileOf = name => ({ getId: () => name, getName: () => name });

// ① まとめる前：3本を古い順に読んだ結果
const before = {};
FILES.forEach(f => readGokigenInto_(fileOf(f.name), before));
Object.keys(before).forEach(d => delete before[d]._ok);

// ② 7/31以前の2本をまとめて base を作り、base → 8月ファイル の順に読んだ結果
const merged = {};
FILES.filter(f => nameDate_(f.name) <= "2026-07-31").forEach(f => readGokigenInto_(fileOf(f.name), merged));
const mergedDates = Object.keys(merged).sort();
mergedDates.forEach(d => delete merged[d]._ok);
STORE["GOKIGEN台帳_base"] = [GOKIGEN_BASE_HEAD].concat(mergedDates.map(d => gokigenBaseRow_(merged[d])));
const after = {};
readGokigenInto_(fileOf("GOKIGEN台帳_base"), after);                      // base を最初に
FILES.filter(f => nameDate_(f.name) > "2026-07-31")
  .forEach(f => readGokigenInto_(fileOf(f.name), after));                 // 残りの日次
Object.keys(after).forEach(d => delete after[d]._ok);

eq(Object.keys(after).sort().join(","), Object.keys(before).sort().join(","), "★日付の顔ぶれが変わらない");
eq(JSON.stringify(after), JSON.stringify(before), "★まとめる前とまとめた後で中身が1文字も変わらない");
eq(before["2026-07-20"].mood, 8, "5段階の「4/5」は10段階の8として読まれている");
eq(after["2026-07-20"].mood, 8, "★まとめた後も「4/5」が8のまま（二重に×2されていない）");
eq(after["2026-07-21"].weight, 84.0, "★列がズレた行が正しい行を上書きしていない");
eq(after["2026-07-22"].note, "7/22の記録（訂正）", "8月のファイルの訂正が勝っている");
eq(after["2026-08-01"].weight, 83.5, "8月の行はそのまま残る");
// base に書き出した「ご機嫌度」の形
eq(STORE["GOKIGEN台帳_base"][1][9], "8/10", "★ご機嫌度は必ず「8/10」の形で書き出す");
eq(GOKIGEN_BASE_HEAD[0], "日付", "base の見出しは「日付」で始まる（読み取りがこれを探す）");
eq(GOKIGEN_BASE_HEAD.length, 15, "base の列は15列（読み取りは位置で見ている）");
// 「=」で始まる一言を数式と誤解されないようにする
eq(safeCell_("=すごい一日"), "'=すごい一日", "「=」で始まる文字列は数式にならないようにする");
eq(safeCell_("ふつうの一言"), "ふつうの一言", "ふつうの文字列はそのまま");
eq(safeCell_(null), "", "空欄は空文字にする");

console.log("\n■ PART2-②: base は更新日時が新しくても必ず最初に読む");
/* DriveApp のかわり。base の更新日時をわざと「いちばん新しく」しておく */
const DRIVE_FILES = [
  { name: "GOKIGEN台帳_base", t: 9999, mime: "SHEET" },
  { name: "GOKIGEN_台帳_2026-08-01", t: 100, mime: "SHEET" },
  { name: "GOKIGEN_台帳_2026-08-16", t: 200, mime: "SHEET" },
  { name: "未来ビジョン台帳_2026-08-13", t: 300, mime: "DOC" }
];
global.MimeType = { GOOGLE_SHEETS: "SHEET", GOOGLE_DOCS: "DOC" };
global.DriveApp = {
  getFolderById: () => ({
    getFiles: () => {
      let i = 0;
      const list = DRIVE_FILES.map(f => ({
        getName: () => f.name, getId: () => f.name,
        getMimeType: () => f.mime, getLastUpdated: () => ({ getTime: () => f.t }),
        isTrashed: () => !!f.trashed          // v1.7.2：ゴミ箱のファイルは読まない
      }));
      return { hasNext: () => i < list.length, next: () => list[i++] };
    }
  })
};
eval(pick("/**\n * 古い順にファイルを返す", "// ===== GOKIGEN台帳 ====="));
const order = filesOldestFirst_("folder", "GOKIGEN台帳_base").map(f => f.getName());
eq(order[0], "GOKIGEN台帳_base", "★base がいちばん最初（更新日時が新しくても）");
eq(order.join(","), "GOKIGEN台帳_base,GOKIGEN_台帳_2026-08-01,GOKIGEN_台帳_2026-08-16",
   "そのあとは古い順（＝新しいファイルが後から上書きする）");
eq(order.indexOf("未来ビジョン台帳_2026-08-13"), -1, "スプレッドシート以外は読まない");
eq(filesOldestFirst_("folder").map(f => f.getName())[0], "GOKIGEN_台帳_2026-08-01",
   "base名を渡さなければ、これまでどおり更新日時だけの順番");

console.log("\n■ PART2-③: 同じ名前のUdemyログを見分ける");
const rowsA = [{ date: "2026-08-13", id: "C01", cumEnroll: 329, cumRevenue: 235.23, rating: 4.63, monthEnroll: null, note: null }];
const rowsB = [{ date: "2026-08-13", id: "C01", cumEnroll: 329, cumRevenue: 235.23, rating: 4.63, monthEnroll: null, note: null }];
const rowsC = [{ date: "2026-08-13", id: "C01", cumEnroll: 340, cumRevenue: 235.23, rating: 4.63, monthEnroll: null, note: null }];
eq(ledgerSignature_(rowsA) === ledgerSignature_(rowsB), true, "★中身が同じログは同じ指紋になる");
eq(ledgerSignature_(rowsA) === ledgerSignature_(rowsC), false, "★1つでも数字が違えば別の指紋になる");
// 並び順が違うだけなら「同じ」とみなす
const rowsD = [{ date: "2026-08-14", id: "C02", cumEnroll: 5 }, { date: "2026-08-13", id: "C01", cumEnroll: 1 }];
const rowsE = [{ date: "2026-08-13", id: "C01", cumEnroll: 1 }, { date: "2026-08-14", id: "C02", cumEnroll: 5 }];
eq(ledgerSignature_(rowsD) === ledgerSignature_(rowsE), true, "行の並び順が違うだけなら同じ扱い");
eq(nameDate_("Udemy台帳ログ_2026-08-13"), "2026-08-13", "ファイル名から日付を取り出す");
eq(nameDate_("Udemy台帳_base"), null, "日付の無い名前は null");
has(gs, "圧縮済み", "移動先は「圧縮済み」フォルダ");
// 整理の処理の中だけを取り出して、捨てる操作が無いことを確かめる
const consolidateCode = pick("// ===== v1.2.1: 台帳の整理", "// 動作確認用：GitHubに書かず");
ok(consolidateCode.indexOf("setTrashed") < 0 && consolidateCode.indexOf("removeFile(file)") >= 0,
   "★整理の処理でファイルを捨てていない（移動だけ・削除は一切しない）",
   "捨てているところがあります");

console.log("\n■ PART3: 経済台帳（引っ越し先の新しい列）");
eq(ECO_FOLDER_ID, "13oyaDeWl0nviGqLF_PblBhgGM-X4NsTR", "★読み先が新しいフォルダになっている");
ok(gs.indexOf("1koH3sVzVu2sqyJvSv5DDXh1MBwShKmAL") < 0 ||
   /旧フォルダ/.test(gs.slice(Math.max(0, gs.indexOf("1koH3sVzVu2sqyJvSv5DDXh1MBwShKmAL") - 200),
                             gs.indexOf("1koH3sVzVu2sqyJvSv5DDXh1MBwShKmAL") + 100)),
   "旧フォルダは参照から外れている（コメントに残っているだけ）", "まだ旧フォルダを読んでいます");

// 新しい台帳の見出しを読めるか
const ECO_NEW = [
  ["日付", "区分", "項目", "数量・額面", "評価額円", "評価損益円", "損益率", "備考"],
  ["2026-08-16", "総括", "SBI証券口座 合計", "", 13104897, 2246626, "+20.69%", "前日比0円"],
  ["2026-08-16", "総括", "総資産(証券+貴金属)", "", 13704370, 2358065, "", "2口座の合算"],
  ["2026-08-16", "資産クラス", "米国株式", "", 5858562, 1933758, "+49.27%", ""],
  ["2026-08-16", "資産クラス", "外貨建債券(米国債)", "", 4975744, 312868, "+6.71%", ""],
  ["2026-08-16", "資産クラス", "預り金(円)", "", 9981, "", "", ""],
  ["2026-08-16", "資産クラス", "預り金(米ドル)", "", 2260610, "", "", "USD/JPY 159.34"],
  ["2026-08-16", "資産クラス", "貴金属(金銀プラチナ)", "", 599473, 111439, "+22.83%", ""],
  ["2026-08-16", "米国株式", "パランティア PLTR", "100株", 2773153, 752353, "", "最大保有"],
  ["2026-08-16", "米国債", "MQ354 4.750% 2037/2/15満期", "額面6400ドル", 1091976, "", "", ""],
  ["2026-08-16", "メモ", "参考為替", "", "", "", "", "USD/JPY 159.34"]
];
const hd = findColumns_(ECO_NEW, ECO_COLS, "date");
ok(hd != null, "★新しい台帳の見出し行を見つけられる", "見出しが見つからない");
eq(hd.map.date, 0, "日付は0列目");
eq(hd.map.cat, 1, "区分は1列目");
eq(hd.map.name, 2, "★「項目」を口座・資産名として読める");
eq(hd.map.amount, 4, "★「評価額円」を評価額として読める（評価損益円と取り違えない）");
eq(ecoLevel_("総括"), "total", "「総括」は合計に足さない段");
eq(ecoLevel_("資産クラス"), "class", "「資産クラス」が合計に使う段");
eq(ecoLevel_("米国株式"), "item", "個別銘柄は内訳の段");
eq(ecoLevel_("メモ"), "memo", "メモは合計に足さない");
eq(ecoLevel_("国内株式"), "item", "旧台帳の区分（国内株式など）は内訳の段になる");
eq(ecoLevel_(null), "item", "区分が空でも落ちない");

/* アプリ側：3重に数えないか */
const leak = code => code.replace(/^(const|let) /gm, "var ");
const pickHtml = (a, b) => {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0) throw new Error("index.html に目印が見つかりません: " + (i < 0 ? a : b));
  return html.slice(i, j);
};
// v1.9.1：経済の金額は util の ecoTotal に一本化したので、そちらも読む
eval(leak(pickHtml("/* ===== util ===== */", "/* ===== state ===== */")));
eval(leak(pickHtml("/* v1.9.1：87歳の声が読む総資産も", "function ckVoiceEco(D){")));
const ecoRows = ECO_NEW.slice(1).map(r => ({
  date: r[0], cat: r[1], name: r[2], amount: typeof r[4] === "number" ? r[4] : null, level: ecoLevel_(r[1])
}));
eq(ckEcoTotal({ eco: { rows: ecoRows } }), 13704370,
   "★合計は資産クラスだけを足した13,704,370円（総括と個別を足して3重に数えない）");
eq(ckEcoTotal({ eco: { rows: ecoRows } }), ecoRows.filter(r => r.name === "総資産(証券+貴金属)")[0].amount,
   "★その合計が台帳の「総資産」と一致する");
// 旧台帳（1行1口座・level が無い）でも今までどおり
const oldRows = [{ cat: "国内株式", name: "野村證券 国内株式", amount: 612800 },
                 { cat: "現金", name: "SBI証券 預り金(円)", amount: 9981 }];
eq(ckEcoTotal({ eco: { rows: oldRows } }), 622781, "★古い形の台帳は今までどおり全部を足す");
eq(ckEcoTotal({ eco: { rows: [] } }), 0, "行が無くても落ちない");

console.log("\n■ 読み込み時間の計測が入っているか");
has(gs, "function timeIt_", "計測の道具がある");
["GOKIGEN台帳", "Udemy台帳", "未来ビジョン台帳", "リミットレス台帳", "経済台帳"].forEach(n =>
  has(gs, "timeIt_('" + n + "'", n + "の時間を測っている"));
has(gs, "⏱ データ作成の合計", "全体の時間も出す");
has(gs, "直下のみ", "フォルダ直下だけを読むと明記してある");

/* ===== v1.7.2：ゴミ箱の同名ファイルは読まない ===== */
console.log("\n【v1.7.2】台帳を作り直したとき、ゴミ箱の古いファイルを読まない");
DRIVE_FILES.push({ name: "GOKIGEN台帳_base", t: 999, mime: "SHEET", trashed: true });
const afterTrash = filesOldestFirst_("folder", "GOKIGEN台帳_base").map(f => f.getName());
ok(afterTrash.filter(n => n === "GOKIGEN台帳_base").length === 1,
   "★ゴミ箱に同名のファイルがあっても、生きている方だけを読む",
   "読んだもの: " + afterTrash.join(" / "));
DRIVE_FILES.pop();


console.log(fail ? "\n❌ " + fail + "件 失敗\n" : "\n全ケース合格 ✅\n");
process.exit(fail ? 1 : 0);
