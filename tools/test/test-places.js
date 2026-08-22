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
eval(pickGs("function normHead_(v) {", "// 見出し行を探して、項目名 → 列番号 の対応表を作る"));
eval(pickGs("// ===== v1.2: base + デルタ形式の台帳を読む共通部品 =====", "// ===== v1.2: リミットレス台帳"));
eval(pickGs("// ===== 変換ヘルパー =====", "// ===== GitHub ====="));
eval(pickGs("var PLACES_COLS", "/** 台帳のファイル。"));
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
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]   // 空行
];
// Drive/Sheets を叩かずに readPlaces_ をそのまま動かす
global.SpreadsheetApp = { openById: () => ({ getSheets: () => [{ getDataRange: () => ({ getValues: () => SHEET }) }] }) };
placesFile_ = () => ({ getId: () => "sheet1", getUrl: () => "https://docs.google.com/x",
                       getName: () => "行きたい場所台帳_base", getLastUpdated: () => new Date(0) });

console.log("\n【要件1】台帳 → places の変換");
const P = readPlaces_();
ok(!!P, "台帳を読めた", "null が返った");
eq(P.count, 6, "★却下1件を除いた6件（空行も落ちる）");
eq(P.dropped, 1, "★却下は1件だけ数えて出力しない");
eq(P.rows.filter(r => r.name === "見送った場所").length, 0, "★却下の場所は places に入らない");
eq(P.noGeo.join(","), "座標のない場所", "★緯度経度が空の場所を警告に出す");
eq(P.rows.filter(r => r.name === "座標のない場所").length, 1, "★でも places からは落とさない（写真タイルには出る）");
ok(logs.some(l => /⚠️ 緯度経度が空/.test(l)), "★ログに警告が出ている", logs.join(" / "));
ok(logs.some(l => /行きたい場所台帳: 6件（定番1・日本4・海外1／予定1・済1）/.test(l)),
   "★ログの件数の出し方（定番n・日本n・海外n／予定n・済n）", logs.join("\n     "));
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

console.log("\n【要件4】並び順（推奨時期の早い順・行った場所は最後）");
const order = plSort(P.rows).map(r => r.timing + "/" + r.name);
eq(order[0], "62〜64歳/ウユニ塩湖", "★いちばん早いのは62〜64歳");
eq(order[order.length - 1], "60代前半/行った場所", "★「済」は時期が早くてもいちばん最後");
eq(plTimingRank("60代前半") < plTimingRank("62〜64歳"), "true", "60代前半 → 62〜64歳");
eq(plTimingRank("62〜64歳") < plTimingRank("2026〜2031"), "true", "62〜64歳 → 2026〜2031");
eq(plTimingRank("2026〜2031") < plTimingRank("64〜67歳"), "true", "2026〜2031 → 64〜67歳");
eq(plTimingRank("64〜67歳") < plTimingRank("67歳以降でも可"), "true", "64〜67歳 → 67歳以降でも可");
eq(plTimingRank("67歳以降でも可") < plTimingRank("後半戦でも可"), "true", "67歳以降でも可 → 後半戦でも可");
eq(plTimingRank("後半戦でも可") < plTimingRank("定番候補"), "true", "後半戦でも可 → 定番候補");
eq(plTimingRank("2031〜2033") > plTimingRank("64〜67歳"), "true", "台帳にある2031〜2033も順番に入っている");
eq(plTimingRank("知らない書き方"), 90, "★知らない書き方はその他（90）に寄せる。落ちない");
eq(plTimingRank(null), 90, "空でも落ちない");
// 同じ時期どうしは台帳のid順
const jp = plSort(plFilter(P.rows, "jp")).map(r => r.id);
eq(jp.join(","), "J01,J04,J09,J99", "★同じ時期のなかは台帳の並び（id順）／済は最後");

console.log("\n【要件4】タブの絞り込み");
eq(plFilter(P.rows, "jp").length, 4, "🗾日本は4件");
eq(plFilter(P.rows, "world").length, 1, "🌍世界は1件");
eq(plFilter(P.rows, "teiban").length, 1, "🏕定番は1件");
const c = plCounts(P.rows);
eq(c.all + "/" + c.planned + "/" + c.done, "6/1/1", "全体・予定・済の数");
eq(plFilter(null, "jp").length, 0, "places が無くても落ちない");
eq(plEffort({ effort: "高" }) + plEffort({ effort: "中" }) + plEffort({ effort: "低" }) + plEffort({}),
   "highmidlowna", "体力→ピンの色（高=赤・中=橙・低=緑）");
eq(plIsDone({ status: "済" }) + "/" + plIsPlanned({ status: "予定" }), "true/true", "済・予定の見分け");

console.log("\n【画面の配線】");
has(pageHtml, 'id="v-map"', "地図の面がある");
has(pageHtml, 'id="v-grid"', "写真タイルの面がある");
has(pageHtml, "leaflet@1.9.4", "Leaflet を読み込んでいる（APIキー不要）");
has(pageHtml, "tile.openstreetmap.org", "地図はOpenStreetMap");
ok(!/api[_-]?key|access[_-]?token|mapbox/i.test(pageHtml), "★APIキーを使っていない", "キーらしき文字列がある");
has(pageHtml, "grid-template-columns:1fr 1fr", "★写真タイルはスマホ2列");
has(pageHtml, "@media(min-width:720px){ .grid{grid-template-columns:repeat(4,1fr)", "★PCは4列");
has(pageHtml, "aspect-ratio:16/9", "写真は16:9");
has(pageHtml, "🗓 この旅を決める", "ボタン1");
has(pageHtml, "🎬 映像を見る", "ボタン2");
has(pageHtml, "📖 もっと読む", "ボタン3");
has(pageHtml, "function share()", "🔗共有ボタン");
has(pageHtml, "jp:[[24,122],[46,146]]", "日本タブは日本全体");
has(pageHtml, "world:[[-60,-170],[78,178]]", "世界タブは世界全体");
ok(!/(円|¥|\$[0-9]|価格|料金|万円)/.test(pageHtml.replace(/[^]*?<script>/, "")),
   "★価格は一切出していない", "金額らしき文字列がある");
ok(!/localStorage|sessionStorage/.test(pageHtml), "★何も保存しない（表示専用）", "ストレージを使っている");
console.log("\n【家族の部屋からの入口】");
has(appHtml, 'href="places.html"', "★index.html から places.html へ行ける");
has(appHtml, "function renderPlacesLink()", "件数を出す関数がある");
has(appHtml, "  renderPlacesLink();", "renderPriv から呼んでいる");
// v1.7.1 で「場所n・低山 踏破n座・あとm座」に変わった（低山の数も入口に出すため）
has(appHtml, "'行きたい場所マップ（場所'+rows.length+", "★入口に場所の件数が出る");
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
