/**
 * v1.7 行きたい場所マップのテスト（node tools/test/test-places.js）
 *
 * 確かめること：
 *   ①【GAS】台帳 → places の変換（却下は出さない／緯度経度が空でも落とさず警告を出す）
 *   ②【ページ】写真は「台帳の写真URLが最優先」→ Commons → プレースホルダー
 *   ③【ページ】決定文のフォーマット（ここが崩れるとClaudeが読めない）
 *   ④【ページ】並び順（推奨時期の早い順・行った場所は最後）と、タブの絞り込み
 *   ⑤【ページ】映像URLが空なら YouTube の「地名 4K」検索を作る
 *   ⑥ places-photos.json の中身と、実データ（data.json）の素通し
 */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "..");
const gs = fs.readFileSync(path.join(root, "tools", "update-data.gs"), "utf8");
const pageHtml = fs.readFileSync(path.join(root, "places.html"), "utf8");
const appHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

let fail = 0;
const ok = (cond, name, detail) => {
  console.log((cond ? "✅ " : "❌ ") + name + (cond ? "" : "\n     " + detail));
  if (!cond) fail++;
};
const eq = (got, want, name) => ok(String(got) === String(want), name, "結果=" + got + "  期待=" + want);
const has = (hay, needle, name) => ok(String(hay).indexOf(needle) >= 0, name, "「" + needle + "」が無い");

/* ========== ① Apps Script 側 ========== */
const logs = [];
const Logger = { log: m => logs.push(String(m)) };
const Utilities = { formatDate: (d, tz, fmt) => "2026-08-22 12:00" };
const pickGs = (a, b) => {
  const i = gs.indexOf(a), j = gs.indexOf(b);
  if (i < 0 || j < 0) throw new Error("update-data.gs に目印が見つかりません: " + (i < 0 ? a : b));
  return gs.slice(i, j);
};
eval(pickGs("var LIMITLESS_FOLDER_ID", "// ===== STEP1"));      // CONFIG（台帳フォルダのIDなど）
eval(pickGs("function normHead_(v) {", "// 見出し行を探して、項目名 → 列番号 の対応表を作る"));
eval(pickGs("// ===== v1.2: base + デルタ形式の台帳を読む共通部品 =====", "// ===== v1.2: リミットレス台帳"));
eval(pickGs("// ===== 変換ヘルパー =====", "// ===== GitHub ====="));
eval(pickGs("/**\n * v1.7.2：「〜台帳_base」を **名前で** 探す。", "/**\n * 古い順にファイルを返す"));  // ledgerByName_
eval(pickGs("var STATUS_DONE_RE", "/** 台帳のファイル。"));   // 状態の言い換え＋PLACES_COLS
eval(pickGs("function readPlaces_() {", "// ===== v1.4: WANT台帳"));

// 本物の台帳と同じ見出し・同じ並び
const HEAD = ["id", "場所", "区分", "地方・国", "緯度", "経度", "体力", "ベストシーズン", "推奨時期",
              "同行", "状態", "決めた時期", "一言", "写真URL", "映像URL", "出典URL", "手配先", "公開した成果物"];
const row = o => HEAD.map((h, i) => {
  const keys = ["id", "name", "kind", "area", "lat", "lng", "effort", "season", "timing",
                "withWhom", "status", "decided", "note", "photo", "video", "source", "booking", "output"];
  return o[keys[i]] === undefined ? "" : o[keys[i]];
});
const SHEET = [HEAD,
  row({ id: "J01", name: "宗谷岬", kind: "日本", area: "北海道", lat: 45.523, lng: 141.937,
        effort: "低", season: "夏", timing: "2026〜2031", withWhom: "アキさん", status: "未",
        note: "日本最北端", source: "https://example.jp/soya" }),
  row({ id: "J04", name: "青い池(美瑛)", kind: "日本", area: "北海道", lat: 43.488, lng: 142.62,
        effort: "低", season: "春〜秋", timing: "2026〜2031", status: "予定", decided: "2027年6月",
        note: "神秘の青" }),
  row({ id: "J09", name: "座標のない場所", kind: "日本", area: "東北・青森", lat: "", lng: "",
        effort: "中", timing: "後半戦でも可", status: "未", note: "緯度経度がまだ" }),
  row({ id: "J99", name: "行った場所", kind: "日本", area: "四国・香川", lat: 34.22, lng: 133.625,
        effort: "低", timing: "60代前半", status: "済", decided: "2026年5月",
        note: "もう行った", output: "https://youtu.be/abc" }),
  row({ id: "X01", name: "見送った場所", kind: "日本", area: "どこか", lat: 35, lng: 135,
        effort: "低", timing: "2026〜2031", status: "却下", note: "行かないことにした" }),
  row({ id: "W03", name: "ウユニ塩湖", kind: "海外", area: "ボリビア", lat: -20.134, lng: -67.489,
        effort: "高", season: "12〜3月", timing: "62〜64歳", status: "未", note: "天空の鏡",
        photo: "https://example.jp/mine.jpg", video: "https://youtu.be/uyuni" }),
  row({ id: "P01", name: "ふもとっぱらキャンプ場", kind: "定番", area: "静岡・富士宮", lat: 35.4, lng: 138.594,
        effort: "低", season: "通年", timing: "定番候補", withWhom: "一族", status: "候補", note: "富士山正面" }),
  // v1.8：区分「グルメ」と、日帰り圏（関東・山梨・静岡・東北の福島）
  row({ id: "G01", name: "那珂湊おさかな市場・あんこう鍋", kind: "グルメ", area: "関東・茨城",
        lat: 36.34, lng: 140.58, effort: "低", season: "11〜3月", timing: "2027冬",
        withWhom: "アキさん", status: "候補", note: "冬の茨城はあんこう" }),
  row({ id: "G21", name: "香港の飲茶・点心", kind: "グルメ", area: "香港", lat: 22.28, lng: 114.16,
        effort: "低", season: "10〜3月", timing: "2030", withWhom: "アキさん", status: "候補" }),
  row({ id: "K05", name: "会津東山温泉 向瀧", kind: "日本", area: "東北・福島", lat: 37.482, lng: 139.953,
        effort: "低", season: "1〜2月", timing: "2027冬", withWhom: "アキさん", status: "候補" }),
  row({ id: "K14", name: "河口湖・大石公園", kind: "日本", area: "山梨・富士五湖", lat: 35.517, lng: 138.75,
        effort: "低", season: "6〜7月", timing: "2026秋", withWhom: "一族", status: "候補" }),
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]   // 空行
];
// Drive/Sheets を叩かずに readPlaces_ をそのまま動かす
global.SpreadsheetApp = { openById: () => ({ getSheets: () => [{ getDataRange: () => ({ getValues: () => SHEET }) }] }) };
placesFile_ = () => ({ getId: () => "sheet1", getUrl: () => "https://docs.google.com/x",
                       getName: () => "行きたい場所台帳_base", getLastUpdated: () => new Date(0) });

/* ===== v1.7.2：台帳を作り直したときに、新しい方を読むか ===== */
console.log("\n【v1.7.2】台帳の探し方（名前が先・固定IDは予備・ゴミ箱は読まない）");
{
  const mk = (name, id, t, trashed) => ({
    getName: () => name, getId: () => id, getUrl: () => "https://docs.google.com/" + id,
    getLastUpdated: () => new Date(t), isTrashed: () => !!trashed
  });
  // 作り直した本番と同じ形：旧ファイルはゴミ箱、新ファイルが生きている
  const OLD = mk("行きたい場所台帳_base", "old-id", "2026-08-20T00:00:00Z", true);
  const NEW = mk("行きたい場所台帳_base", "new-id", "2026-08-22T22:34:00Z", false);
  let folderFiles = [OLD, NEW], byId = { "old-id": OLD, "new-id": NEW };
  global.DriveApp = {
    getFolderById: () => ({
      getFilesByName: n => { let i = 0; const l = folderFiles.filter(f => f.getName() === n);
        return { hasNext: () => i < l.length, next: () => l[i++] }; }
    }),
    getFileById: id => { if (!byId[id]) throw new Error("見つかりません: " + id); return byId[id]; }
  };
  logs.length = 0;
  eq(ledgerByName_("行きたい場所台帳_base", "old-id").getId(), "new-id",
     "★ゴミ箱の旧ファイルではなく、生きている新しい台帳を読む");
  ok(!logs.some(l => /固定IDで開きました/.test(l)), "★名前で見つかったので固定IDは使わない", logs.join(" / "));

  // 同名が2つ生きているときは、更新時刻がいちばん新しいものを採って警告
  const NEW2 = mk("行きたい場所台帳_base", "new2-id", "2026-08-23T09:00:00Z", false);
  folderFiles = [NEW, NEW2]; byId["new2-id"] = NEW2;
  logs.length = 0;
  eq(ledgerByName_("行きたい場所台帳_base", "old-id").getId(), "new2-id",
     "★同名が2件なら更新時刻が新しい方");
  ok(logs.some(l => /⚠️ 同名の台帳が 2 件、最新（更新時刻）を採用/.test(l)),
     "★同名が複数あることを警告に出す", logs.join(" / "));

  // 名前で見つからないときだけ固定IDを使う
  folderFiles = [];
  logs.length = 0;
  eq(ledgerByName_("行きたい場所台帳_base", "new-id").getId(), "new-id", "名前で無ければ固定IDが予備になる");
  ok(logs.some(l => /固定IDで開きました/.test(l)), "予備を使ったことをログに残す", logs.join(" / "));

  // 名前でも見つからず、固定IDもゴミ箱なら null（古い台帳を読み続けない）
  logs.length = 0;
  eq(ledgerByName_("行きたい場所台帳_base", "old-id"), "null",
     "★固定IDの先がゴミ箱なら読まない（null）");
  ok(logs.some(l => /ゴミ箱にあります/.test(l)), "ゴミ箱だったことを警告に出す", logs.join(" / "));

  eq(ledgerByName_("ない台帳_base", null), "null", "どこにも無ければ null");
}
has(gs, "function placesFile_() {\n  return ledgerByName_(CONFIG.placesFileName, CONFIG.placesFileId);",
    "★行きたい場所台帳は名前優先で探す");
has(gs, "function mtnFile_() {\n  return ledgerByName_(CONFIG.mtnFileName, CONFIG.mtnFileId);",
    "★低山台帳も名前優先");
has(gs, "function wantFile_() {\n  return ledgerByName_(CONFIG.wantFileName, CONFIG.wantFileId);",
    "★WANT台帳も名前優先");
has(gs, "var w = wantFile_();", "★更新ガードも名前で取った最新ファイルの更新時刻を見る");
ok((gs.match(/isTrashed\(\)/g) || []).length >= 8,
   "★Driveからファイルを取るところでは、ゴミ箱のものを外している",
   "isTrashed の数: " + (gs.match(/isTrashed\(\)/g) || []).length);

console.log("\n【要件1】台帳 → places の変換");
const P = readPlaces_();
ok(!!P, "台帳を読めた", "null が返った");
eq(P.count, 10, "★却下1件を除いた10件（空行も落ちる）");
eq(P.dropped, 1, "★却下は1件だけ数えて出力しない");
eq(P.rows.filter(r => r.name === "見送った場所").length, 0, "★却下の場所は places に入らない");
// v1.7.2：状態の書き方のゆれ（済／行った、予定／計画）
eq(STATUS_DONE_RE.test("行った") + "/" + STATUS_DONE_RE.test("済"), "true/true", "★「行った」も「済」として数える");
eq(STATUS_PLAN_RE.test("計画") + "/" + STATUS_PLAN_RE.test("予定"), "true/true", "★「計画」も「予定」として数える");
eq(STATUS_DONE_RE.test("未"), "false", "「未」は済ではない");
eq(P.noGeo.join(","), "座標のない場所", "★緯度経度が空の場所を警告に出す");
eq(P.rows.filter(r => r.name === "座標のない場所").length, 1, "★でも places からは落とさない（写真タイルには出る）");
ok(logs.some(l => /⚠️ 緯度経度が空/.test(l)), "★ログに警告が出ている", logs.join(" / "));
ok(logs.some(l => /行きたい場所台帳: 10件（定番1・日本6・海外1・グルメ2／予定1・済1）/.test(l)),
   "★ログの件数の出し方（定番n・日本n・海外n・グルメn／予定n・済n）", logs.join("\n     "));
const soya = P.rows.filter(r => r.id === "J01")[0];
eq(soya.lat, 45.523, "緯度が数字で入る");
eq(soya.lng, 141.937, "経度が数字で入る");
eq(soya.kind, "日本", "区分");
eq(soya.effort, "低", "体力");
eq(soya.note, "日本最北端", "一言");
eq(soya.photo, "null", "写真URLが空なら null（ページ側でCommonsを当てる）");
eq(P.rows.filter(r => r.id === "W03")[0].lng, -67.489, "★南半球・西経のマイナスも読める");
eq(P.rows.filter(r => r.id === "J99")[0].output, "https://youtu.be/abc", "公開した成果物");

/* ========== ②〜⑤ ページ側（places.html） ========== */
const leak = code => code.replace(/^(const|let|var) /gm, "var ");
const pickHtml = (a, b) => {
  const i = pageHtml.indexOf(a), j = pageHtml.indexOf(b);
  if (i < 0 || j < 0) throw new Error("places.html に目印が見つかりません: " + (i < 0 ? a : b));
  return pageHtml.slice(i, j);
};
eval(leak(pickHtml("/* ===== v1.7 場所の並べ替え・絞り込みここから =====",
                   "/* ===== v1.7 場所の並べ替え・絞り込みここまで ===== */")));

console.log("\n【要件2】写真は「台帳の写真URL」が最優先");
const COMMONS = { "宗谷岬": { url: "https://upload.wikimedia.org/soya.jpg", title: "Cape Soya.jpg",
                              artist: "Someone", license: "CC BY-SA 4.0", full: "https://commons.x/soya" },
                  "ウユニ塩湖": { url: "https://upload.wikimedia.org/uyuni.jpg", title: "Uyuni.jpg" } };
eq(plPhoto(P.rows.filter(r => r.id === "W03")[0], COMMONS).url, "https://example.jp/mine.jpg",
   "★台帳に写真URLがあれば、Commonsより台帳が勝つ（差し替え用）");
eq(plPhoto(P.rows.filter(r => r.id === "W03")[0], COMMONS).from, "台帳", "出どころが台帳と分かる");
eq(plPhoto(soya, COMMONS).url, "https://upload.wikimedia.org/soya.jpg", "台帳が空ならCommonsの1枚");
eq(plPhoto(soya, COMMONS).license, "CC BY-SA 4.0", "★ライセンスも持ち回る（画面の下に小さく出す）");
eq(plPhoto(P.rows.filter(r => r.id === "J99")[0], COMMONS), "null",
   "★どちらも無ければ null（グレーのプレースホルダーになる）");
eq(plPhoto(soya, {}), "null", "photos が空でも落ちない");

console.log("\n【要件5】映像URL");
eq(plVideo(P.rows.filter(r => r.id === "W03")[0]), "https://youtu.be/uyuni", "台帳にあればそれ");
eq(plVideo(soya), "https://www.youtube.com/results?search_query=" + encodeURIComponent("宗谷岬 4K"),
   "★空なら「地名 4K」のYouTube検索を作る");
ok(plVideo(soya).indexOf("4K") > 0 || /4K/.test(decodeURIComponent(plVideo(soya))), "4K が入っている", plVideo(soya));

console.log("\n【要件3】決定文のフォーマット（Claudeが読む合図。形を変えない）");
eq(plDecision("宗谷岬", 2027, 8), "🗺行きたい場所マップ｜宗谷岬｜2027年8月｜決定", "★決定文");
eq(plDecision("青い池(美瑛)", 2031, 12), "🗺行きたい場所マップ｜青い池(美瑛)｜2031年12月｜決定", "かっこ入りの地名でも同じ形");
ok(plDecision("x", 2026, 1).split("｜").length === 4, "★区切りは全角の縦棒3つ", plDecision("x", 2026, 1));
has(pageHtml, "for(i=2026;i<=2036;i++)", "年は2026〜2036から選ぶ");
has(pageHtml, "この一文をClaudeに貼れば、台帳・カレンダー・手配が動き出します。", "コピー後の1行");
has(pageHtml, "家族の方はなかじまさんにLINEで送ってください", "家族向けの案内");

console.log("\n【v1.7.3】推奨時期を西暦の年に直す");
eq(plTimingRank("2026"), 2026, "年だけならその年");
eq(plTimingRank("2027夏"), 2027, "★「2027夏」→ 2027");
eq(plTimingRank("2028(59歳)"), 2028, "★「2028(59歳)」→ 年が優先で 2028（59歳ではない）");
eq(plTimingRank("2032年末"), 2032, "「2032年末」→ 2032");
eq(plTimingRank("2026〜2031"), 2026, "★幅があるときは始まりの年");
eq(plTimingRank("2031〜2036"), 2031, "同上");
eq(plTimingRank("60代前半"), 2029, "★「60代前半」→ 60歳の年 2029");
eq(plTimingRank("62〜64歳"), 2031, "★「62〜64歳」→ 2031");
eq(plTimingRank("62〜67歳"), 2031, "「62〜67歳」も始まりの62歳＝2031");
eq(plTimingRank("64〜67歳"), 2033, "★「64〜67歳」→ 2033");
eq(plTimingRank("67歳以降でも可"), 2036, "★「67歳以降でも可」→ 2036");
eq(plTimingRank("後半戦でも可"), 2036, "★「後半戦でも可」→ 2036");
eq(plTimingRank("定番候補"), 9998, "★「定番候補」はいちばん最後の手前");
eq(plTimingRank("知らない書き方"), 9999, "★読めない書き方は末尾。落ちない");
eq(plTimingRank(null), 9999, "空でも落ちない");
eq(plTimingRank("2026〜2031") < plTimingRank("60代前半"), "true", "2026〜2031 → 60代前半");
eq(plTimingRank("60代前半") < plTimingRank("62〜64歳"), "true", "60代前半 → 62〜64歳");
eq(plTimingRank("64〜67歳") < plTimingRank("定番候補"), "true", "64〜67歳 → 定番候補");

console.log("\n【v1.7.3】タイルの端に出す短いラベル");
eq(plTimingLabel("2027夏"), "2027夏", "季節つきはそのまま");
eq(plTimingLabel("2028(59歳)"), "2028", "★かっこ書きは落として年だけ");
eq(plTimingLabel("2026〜2031"), "2026〜", "★幅があることは「〜」で示す");
eq(plTimingLabel("2032年末"), "2032年末", "年末はそのまま");
eq(plTimingLabel("67歳以降でも可"), "67歳以降", "★「でも可」は落とす");
eq(plTimingLabel("後半戦でも可"), "後半戦", "同上");
eq(plTimingLabel("定番候補"), "定番", "★「候補」は落とす");
eq(plTimingLabel("60代前半"), "60代前半", "そのまま出るものはそのまま");
eq(plTimingLabel(""), "", "空なら空");

console.log("\n【v1.7.3】並び順（推奨時期の早い順・同じ年は体力 高→低・済は最後）");
const YR = [
  { id: "A1", name: "2027の低い山", timing: "2027夏", effort: "低", status: "未", kind: "日本" },
  { id: "A2", name: "2027の高い山", timing: "2027秋", effort: "高", status: "未", kind: "日本" },
  { id: "A3", name: "2027の中くらい", timing: "2027", effort: "中", status: "未", kind: "日本" },
  { id: "A4", name: "いま行ける", timing: "2026〜2031", effort: "低", status: "未", kind: "日本" },
  { id: "A5", name: "62〜64歳のもの", timing: "62〜64歳", effort: "高", status: "未", kind: "日本" },
  { id: "A6", name: "定番", timing: "定番候補", effort: "低", status: "候補", kind: "日本" },
  { id: "A7", name: "書き方が読めない", timing: "そのうち", effort: "低", status: "未", kind: "日本" },
  { id: "A8", name: "もう行った", timing: "2026", effort: "低", status: "済", kind: "日本" }
];
const ord = plSort(YR).map(r => r.name);
console.log("   " + ord.join(" → "));
eq(ord[0], "いま行ける", "★2026がいちばん早い");
eq(ord.slice(1, 4).join(","), "2027の高い山,2027の中くらい,2027の低い山",
   "★同じ2027のなかは体力 高→中→低（脚を使うものを先に）");
eq(ord[4], "62〜64歳のもの", "2031");
eq(ord[5], "定番", "★定番候補は後ろ");
eq(ord[6], "書き方が読めない", "★読めないものは末尾");
eq(ord[7], "もう行った", "★済は年が早くてもいちばん最後");
eq(plSort(YR).length, YR.length, "並べ替えで場所が減らない");
eq(plSort([]).length, 0, "空でも落ちない");

console.log("\n【要件4】並び順（作り物の台帳でも成り立つ）");
const order = plSort(P.rows).map(r => r.timing + "/" + r.name);
eq(order[0], "2026〜2031/宗谷岬", "★いちばん早いのは2026〜2031");
eq(order[order.length - 1], "60代前半/行った場所", "★「済」は時期が早くてもいちばん最後");
const jp = plSort(plFilter(P.rows, "jp")).map(r => r.id);
// 2026が3つ（J01・J04・K14）でどれも体力低なので、そこは台帳の並び（id順）
eq(jp.join(","), "J01,J04,K14,K05,J09,J99", "★推奨時期の年順→体力→台帳の並び／済は最後");

console.log("\n【要件4】タブの絞り込み");
eq(plFilter(P.rows, "jp").length, 6, "🗾日本は6件");
eq(plFilter(P.rows, "world").length, 1, "🌍世界は1件（グルメの海外はここに入らない）");
eq(plFilter(P.rows, "teiban").length, 1, "🏕定番は1件");
const c = plCounts(P.rows);
eq(c.all + "/" + c.planned + "/" + c.done, "10/1/1", "全体・予定・済の数");
eq(plFilter(null, "jp").length, 0, "places が無くても落ちない");
eq(plEffort({ effort: "高" }) + plEffort({ effort: "中" }) + plEffort({ effort: "低" }) + plEffort({}),
   "highmidlowna", "体力→ピンの色（高=赤・中=橙・低=緑）");
eq(plIsDone({ status: "済" }) + "/" + plIsPlanned({ status: "予定" }), "true/true", "済・予定の見分け");

console.log("\n【v1.8】区分「グルメ」の振り分け");
eq(plFilter(P.rows, "gourmet").length, 2, "★🍽グルメは2件（国内1・海外1）");
eq(plFilter(P.rows, "gourmet").map(r => r.id).join(","), "G01,G21", "中身も合っている");
ok(plFilter(P.rows, "jp").every(r => !/グルメ/.test(r.kind)), "★グルメは日本タブに出ない", "");
ok(plFilter(P.rows, "world").every(r => !/グルメ/.test(r.kind)),
   "★海外のグルメ（香港）は世界タブではなくグルメタブへ", "");
eq(plCounts(P.rows).gourmet, 2, "タブに出すグルメの数");
eq(plCounts(P.rows).spots, 8, "★入口の「場所n」はグルメを除いた数（10−2）");
eq(plFilter(P.rows, "gourmet")[0].name, "那珂湊おさかな市場・あんこう鍋", "グルメも他と同じ作りで並ぶ");
eq(plSort(plFilter(P.rows, "gourmet")).map(r => r.id).join(","), "G01,G21",
   "★グルメも推奨時期の早い順（2027冬 → 2030）");

console.log("\n【v1.8】🚗日帰り圏の絞り込み（関東・山梨・静岡・東北の福島）");
eq(plIsDayTrip({ area: "関東・千葉" }), "true", "関東はまるごと日帰り圏");
eq(plIsDayTrip({ area: "関東・神奈川" }), "true", "関東・神奈川");
eq(plIsDayTrip({ area: "山梨・富士五湖" }), "true", "★山梨");
eq(plIsDayTrip({ area: "静岡・富士宮" }), "true", "★静岡");
eq(plIsDayTrip({ area: "東北・福島" }), "true", "★東北は福島だけ日帰り圏");
eq(plIsDayTrip({ area: "東北・青森" }), "false", "★東北でも青森は日帰り圏ではない");
eq(plIsDayTrip({ area: "東北・宮城" }), "false", "宮城も違う");
eq(plIsDayTrip({ area: "北海道" }), "false", "北海道は違う");
eq(plIsDayTrip({ area: "近畿・和歌山" }), "false", "近畿は違う");
eq(plIsDayTrip({ area: "香港" }), "false", "海外は違う");
eq(plIsDayTrip({}), "false", "地方・国が空でも落ちない");
eq(plIsDayTrip(null), "false", "null でも落ちない");
const day = plFilter(P.rows, "jp").filter(plIsDayTrip).map(r => r.id);
eq(day.join(","), "K05,K14", "★日本タブを日帰り圏で絞ると会津(福島)と河口湖(山梨)だけ");
eq(plCounts(P.rows).dayTrip, 4, "日帰り圏の総数（定番の富士宮・グルメの茨城も入る）");

console.log("\n【画面の配線】");
has(pageHtml, 'id="v-map"', "地図の面がある");
has(pageHtml, 'id="v-grid"', "写真タイルの面がある");
has(pageHtml, "leaflet@1.9.4", "Leaflet を読み込んでいる（APIキー不要）");
has(pageHtml, "tile.openstreetmap.org", "地図はOpenStreetMap");
ok(!/api[_-]?key|access[_-]?token|mapbox/i.test(pageHtml), "★APIキーを使っていない", "キーらしき文字列がある");
has(pageHtml, "grid-template-columns:1fr 1fr", "★写真タイルはスマホ2列");
has(pageHtml, "@media(min-width:720px){ .grid{grid-template-columns:repeat(4,1fr)", "★PCは4列");
has(pageHtml, "aspect-ratio:16/9", "写真は16:9");
has(pageHtml, 'class="tlab"', "★タイルの端に推奨時期のラベルを出している");
has(pageHtml, "plTimingLabel(p.timing)", "ラベルは短くしたもの");
has(pageHtml, "🗓 この旅を決める", "ボタン1");
has(pageHtml, "🎬 映像を見る", "ボタン2");
has(pageHtml, "📖 もっと読む", "ボタン3");
has(pageHtml, "function share()", "🔗共有ボタン");
has(pageHtml, "jp:[[24,122],[46,146]]", "日本タブは日本全体");
has(pageHtml, "{k:'gourmet',l:'🍽 グルメ'", "★5つ目のタブがある");
has(pageHtml, "🚗 日帰り圏（", "★日本タブに日帰り圏のボタンがある");
has(pageHtml, "function setJFilt(", "日帰り圏の切り替え");
has(pageHtml, "gourmet:null", "★グルメの地図はピンに合わせる（日本と海外が混ざるので）");
has(appHtml, "'・グルメ'+gourmet+", "★入口ボタンにグルメの数が出る");
has(pageHtml, "world:[[-60,-170],[78,178]]", "世界タブは世界全体");
ok(!/(円|¥|\$[0-9]|価格|料金|万円)/.test(pageHtml.replace(/[^]*?<script>/, "")),
   "★価格は一切出していない", "金額らしき文字列がある");
ok(!/localStorage|sessionStorage/.test(pageHtml), "★何も保存しない（表示専用）", "ストレージを使っている");
console.log("\n【家族の部屋からの入口】");
has(appHtml, 'href="places.html"', "★index.html から places.html へ行ける");
has(appHtml, "function renderPlacesLink()", "件数を出す関数がある");
has(appHtml, "  renderPlacesLink();", "renderPriv から呼んでいる");
// v1.7.1 で「場所n・低山 踏破n座・あとm座」に変わった（低山の数も入口に出すため）
has(appHtml, "'行きたい場所マップ（場所'+(rows.length-gourmet)+", "★入口に場所の件数が出る（グルメは別勘定）");
const iPriv = appHtml.indexOf('id="pg-priv"'), iBtn = appHtml.indexOf('id="placesCard"'),
      iGraph = appHtml.indexOf('id="pg-graph"');
ok(iPriv < iBtn && iBtn < iGraph, "★入口は家族・プライベートの部屋の中にある", iPriv + "/" + iBtn + "/" + iGraph);

console.log("\n【要件6】places-photos.json と実データ");
const pj = path.join(root, "places-photos.json");
if (fs.existsSync(pj)) {
  const ph = JSON.parse(fs.readFileSync(pj, "utf8"));
  const keys = Object.keys(ph.photos || {});
  const noUrl = keys.filter(k => !ph.photos[k].url);
  console.log("   写真: " + keys.length + "件（" + ph.source + "／" + ph.fetchedAt + "）");
  ok(keys.length > 0 && noUrl.length === 0, "写真ファイルの中身がそろっている", "url の無い行: " + noUrl.join(","));
  ok(keys.every(k => /^https:\/\//.test(ph.photos[k].url)), "★すべて https", "http の行がある");
  const noCred = keys.filter(k => !ph.photos[k].license);
  ok(noCred.length === 0, "ライセンスも控えてある（画面の下に小さく出す）", "無い: " + noCred.join(","));
} else ok(false, "places-photos.json がある", "まだ作られていない");

const real = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));
const rr = ((real.places || {}).rows) || [];
console.log("   data.json: v" + real.version + " ／ places " + rr.length + "件" +
            (rr.length ? "（" + JSON.stringify(plCounts(rr)) + "）" : "（次の runNow で入ります）"));
ok(plSort(rr).length === rr.length && plFilter(rr, "jp").length <= rr.length, "実データでも落ちない");

console.log(fail ? "\n❌ " + fail + "件 失敗\n" : "\n全ケース合格 ✅\n");
process.exit(fail ? 1 : 0);
