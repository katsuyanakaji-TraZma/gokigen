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
/**
 * 本物のスプレッドシートにセルを入れたとき、何になって返ってくるかを真似る。
 *   ・先頭の「'」は「これは文字列」という印として食べられる（読み戻すと消えている）
 *   ・「10/10」のように日付に見える文字列は **Date に変換されてしまう**
 * ②を真似ていなかったせいで、「ご機嫌度10が統合で消える」不具合を
 * これまでのテストは見逃していた（2026-07-21）。
 */
const sheetCell = cell => {
  if (typeof cell !== "string") return cell;
  if (/^'/.test(cell)) return cell.slice(1);
  const m = cell.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return new Date(2026, +m[1] - 1, +m[2]);
  return cell;
};
const sheetRows = rows => rows.map(r => r.map(sheetCell));

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
// 本物のスプレッドシートに書いたのと同じ状態にしてから読み戻す
STORE["GOKIGEN台帳_base"] = sheetRows([GOKIGEN_BASE_HEAD].concat(mergedDates.map(d => gokigenBaseRow_(merged[d]))));
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
// 書き出す時点では「'8/10」（「'」は文字列の印）。シートに入ると「8/10」の文字列になる
eq(gokigenBaseRow_(merged["2026-07-20"])[9], "'8/10",
   "★ご機嫌度は「'8/10」と書く（「'」が無いと10月8日にされてしまう）");
eq(STORE["GOKIGEN台帳_base"][1][9], "8/10", "★シートに入ると「8/10」の文字列として残る");
ok(!(STORE["GOKIGEN台帳_base"][1][9] instanceof Date),
   "★★日付に化けていない（ここが化けるとご機嫌度が消える）", String(STORE["GOKIGEN台帳_base"][1][9]));
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
// v1.10.1：名前でしぼる引数を足したので、そこも見る
eq(filesOldestFirst_("folder", null, /^GOKIGEN[_ ]?台帳/).map(f => f.getName()).join(","),
   filesOldestFirst_("folder").map(f => f.getName()).filter(n => /^GOKIGEN[_ ]?台帳/.test(n)).join(","),
   "★名前でしぼると、GOKIGEN台帳のファイルだけになる（他の台帳は開かない）");
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

/* ===== v1.10.1：自動統合しても、読める中身が1文字も変わらないか =====
   runNow のたびに統合が走るようになったので、「まとめる前」と「まとめたあと」で
   readGokigen_ が返すものが完全に同じであることを、実際に読み書きして確かめる。 */
console.log("\n【v1.10.1】統合の前後で中身が変わらない");
{
  eval(pick("// ===== GOKIGEN台帳 =====", "// ===== Udemy台帳（base + デルタの合算） ====="));  // readGokigen_ / HEALTH_FIELDS
  eval(pick("/**\n * v1.10.1：まとめる前（before）と、", "// ===== v1.6: Googleカレンダー"));    // gokigenDiff_

  /* 本物の台帳と同じ形の日次ファイルを4本作る。
     わざと難しくしてある：
       ・ご機嫌度が5段階（4/5）と10段階（8/10）で混在
       ・同じ日が2本のファイルに出てくる（新しい方が勝つ）
       ・列がズレた壊れ行が混ざっている（正しい行を上書きしてはいけない）
       ・「=」で始まる一言（数式と読まれてはいけない） */
  const HEAD = ["日付", "曜日", "体重", "体脂肪率", "筋肉量", "内臓脂肪", "体年齢",
                "血圧上", "血圧下", "ご機嫌度", "睡眠", "運動", "会食", "ルーティン", "一言"];
  const FILES = {
    "GOKIGEN台帳_2026-08-01": [HEAD,
      ["2026-08-01", "土", 83.2, 30.1, 55.0, 12, 62, 128, 82, "4/5", 78, "散歩3km", "なし", 80, "月初めの一言"],
      ["2026-08-02", "日", 83.0, 30.0, 55.1, 12, 62, 126, 80, 8, 81, "ジム", "家族で焼肉", 90, "=1+1 で始まる一言"]],
    "GOKIGEN台帳_2026-08-03": [HEAD,
      // ご機嫌度10 …「10/10」と書くとスプレッドシートが10月10日にしてしまう（v1.10.1の不具合）
      ["2026-08-03", "月", 82.8, 29.9, 55.2, 11, 61, 124, 79, 10, 85, "", "なし", 70, ""],
      // 列がズレた壊れ行（体重の位置に「4/5」）。正しい8/02の行を壊してはいけない
      ["2026-08-02", "日", "4/5", "長い文章がここに来てしまっている", "", "", 6, "", "", "", "", "", "", "", ""]],
    "GOKIGEN台帳_2026-08-04": [HEAD,
      // 同じ日を書き直した（新しいファイルが勝つ）
      ["2026-08-01", "土", 83.1, 30.0, 55.0, 12, 62, 128, 82, "4/5", 78, "散歩3km", "なし", 80, "書き直した一言"],
      ["2026-08-04", "火", 82.9, 29.8, 55.3, 11, 61, 122, 78, 7, 88, "ゴルフ", "客・アズビル懇親", 75, "会食あり"]],
    "GOKIGEN台帳_base": [HEAD,
      ["2026-07-30", "木", 84.0, 30.5, 54.8, 13, 63, 130, 84, "8/10", 72, "", "なし", 60, "7月の記録"]]
  };

  // Drive/Sheets の作り物。ファイルは名前で引ける「シートの中身」でしかない
  const SHEETS = JSON.parse(JSON.stringify(FILES));
  const moved = [];
  const mkFile = name => ({
    getName: () => name, getId: () => name, getMimeType: () => "SHEET",
    getLastUpdated: () => ({ getTime: () => Object.keys(SHEETS).indexOf(name) }),
    isTrashed: () => false, moveTo: dest => { moved.push(name); delete SHEETS[name]; }
  });
  global.MimeType = { GOOGLE_SHEETS: "SHEET", GOOGLE_DOCS: "DOC" };
  global.SpreadsheetApp = {
    openById: id => ({ getId: () => id, getUrl: () => "https://docs.google.com/" + id,
      getSheets: () => [{
      getDataRange: () => ({ getValues: () => SHEETS[id] }),
      clear: () => { SHEETS[id] = []; },
      /* 本物のスプレッドシートのふるまいを、2つだけ真似る。
         ① 先頭の「'」は「これは文字列」という印として食べる（読み戻すと消えている）
         ② 「10/10」のように**日付に見える文字列は Date に変換してしまう**
            ← これを真似ていなかったので、v1.10.1のテストは
              「ご機嫌度10が null に化ける」不具合を見逃していた。 */
      getRange: (r, c, nr, nc) => ({
        setValues: v => { SHEETS[id] = v.map(row => row.map(sheetCell)); },
        setValue: v => {} })
    }] }),
    flush: () => {}
  };
  global.DriveApp = {
    getFolderById: () => ({
      getFiles: () => { const l = Object.keys(SHEETS).map(mkFile); let i = 0;
        return { hasNext: () => i < l.length, next: () => l[i++] }; },
      getFilesByName: n => { const l = SHEETS[n] ? [mkFile(n)] : []; let i = 0;
        return { hasNext: () => i < l.length, next: () => l[i++] }; },
      getFoldersByName: () => ({ hasNext: () => true, next: () => ({ getName: () => "圧縮済み" }) })
    }),
    getFileById: id => mkFile(id)
  };

  // ① まとめる前に readGokigen_ で読んだ中身を控える
  const before = readGokigen_();
  const beforeDates = Object.keys(before).sort();
  eq(beforeDates.join(","), "2026-07-30,2026-08-01,2026-08-02,2026-08-03,2026-08-04", "統合前は5日ぶん");
  eq(before["2026-08-01"].note, "書き直した一言", "同じ日は新しいファイルが勝つ");
  eq(before["2026-08-02"].weight, 83.0, "★壊れ行に正しい行を上書きされていない");
  eq(before["2026-08-01"].mood, 8, "5段階の「4/5」は10段階の8として読む");
  eq(before["2026-08-03"].mood, 10, "★ご機嫌度10（ここが統合で消えていた）");

  // ② 統合する（14日より古いもの＝ここでは全部。3本以上あるので実行される）
  const msg = consolidateGokigen_("2026-08-10", 12, 3);
  has(msg, "統合しました", "統合が走った");
  eq(moved.length, 3, "★日次3本が「圧縮済み」へ移った（baseは移さない）");
  eq(Object.keys(SHEETS).join(","), "GOKIGEN台帳_base", "★残ったのは base だけ");

  // ③ まとめたあとに、もう一度 readGokigen_ で読む
  const after = readGokigen_();
  eq(Object.keys(after).sort().join(","), beforeDates.join(","), "★日付が1日も欠けていない");
  eq(gokigenDiff_(before, after), "null", "★1項目も変わっていない（体重〜一言まで全部）");
  // 目で見ても分かるように、代表的な値を並べて確かめる
  eq(after["2026-08-01"].note, "書き直した一言", "一言もそのまま");
  eq(after["2026-08-02"].note, "=1+1 で始まる一言", "★「=」で始まる一言が数式にならずに戻る");
  eq(after["2026-08-02"].weight, 83.0, "壊れ行に負けていない");
  eq(after["2026-08-04"].dining, "客・アズビル懇親", "会食欄");
  eq(after["2026-08-01"].mood + "・" + after["2026-08-03"].mood, "8・10",
     "★ご機嫌度が5段階と10段階で混ざらない／10も消えない");
  eq(after["2026-08-03"].mood, 10, "★【v1.10.2】ご機嫌度10が統合で null に化けない");
  eq(after["2026-07-30"].weight, 84.0, "baseにもとからあった行も残っている");

  // ④ 中身が違えば必ず気づく（gokigenDiff_ の逆テスト）
  const broken = JSON.parse(JSON.stringify(after));
  broken["2026-08-02"].weight = 99.9;
  has(gokigenDiff_(before, broken), "2026-08-02 のweight", "★値が変わっていれば言い当てる");
  const lost = JSON.parse(JSON.stringify(after));
  delete lost["2026-08-03"];
  has(gokigenDiff_(before, lost), "消えている", "★日が消えていれば言い当てる");
  /* safeCell_ が付ける「'」は中身ではないので、それだけを理由に統合を止めない
     （止めてしまうと、「=」で始まる一言を書いた日から統合が永久に進まなくなる） */
  const quoted = JSON.parse(JSON.stringify(after));
  quoted["2026-08-02"].note = "'" + quoted["2026-08-02"].note;
  eq(gokigenDiff_(before, quoted), "null", "★先頭の「'」だけの違いは差分とみなさない");

  console.log("\n【v1.10.1】ムダに重くしないための決めごと");
  // 3本に満たなければ見送る
  SHEETS["GOKIGEN台帳_2026-08-05"] = [HEAD, ["2026-08-05", "水", 82.7, 29.7, 55.4, 11, 61, 120, 76, 8, 90, "", "なし", 80, ""]];
  const few = consolidateGokigen_("2026-08-10", 12, 3);
  has(few, "まだ見送り", "★1本だけなら base を開かずに見送る");
  eq(Object.keys(SHEETS).sort().join(","), "GOKIGEN台帳_2026-08-05,GOKIGEN台帳_base", "見送ったので移動もしない");
  // 上限（1回で2本まで）
  SHEETS["GOKIGEN台帳_2026-08-06"] = [HEAD, ["2026-08-06", "木", 82.6, 29.6, 55.5, 11, 61, 121, 77, 8, 88, "", "なし", 80, ""]];
  SHEETS["GOKIGEN台帳_2026-08-07"] = [HEAD, ["2026-08-07", "金", 82.5, 29.5, 55.6, 11, 61, 122, 78, 8, 86, "", "なし", 80, ""]];
  const capped = consolidateGokigen_("2026-08-10", 2, 3);
  has(capped, "残り1本は次の回にまとめます", "★1回にまとめる本数に上限がある");
  eq(Object.keys(SHEETS).sort().join(","), "GOKIGEN台帳_2026-08-07,GOKIGEN台帳_base",
     "★古い2本だけ片づいて、いちばん新しい1本は残る");
  const after2 = readGokigen_();
  eq(gokigenDiff_(after, after2) === null || Object.keys(after2).length === 8, "true",
     "上限をかけても中身は壊れない");
  eq(Object.keys(after2).length, 8, "8/05〜8/07も読める（8日分）");
  // 対象なし
  has(consolidateGokigen_("2026-01-01", 12, 3), "まとめ対象はありませんでした", "古いものが無ければ何もしない");

  console.log("\n【v1.10.1】自動で走る配線");
  has(gs, "try { autoConsolidate_(props); }", "★runNow（run_）から自動で呼ばれる");
  has(gs, "if (props.getProperty(PROP_LAST_CONSOLIDATE) === today) return null;", "★1日1回まで");
  has(gs, "consolidateKeepDays: 14", "直近14日ぶんは残す");
  has(gs, "consolidateMinFiles: 3", "3本たまってからまとめる");
  has(gs, "consolidateMaxPerRun: 12", "1回で12本まで");
  has(gs, "catch (e) { Logger.log('⚠️ 自動統合でエラー", "★統合が失敗しても data.json 作りは止めない");
}

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
