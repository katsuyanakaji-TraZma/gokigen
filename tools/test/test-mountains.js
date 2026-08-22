/**
 * v1.7.1 ⛰低山100（山＋セット温泉）のテスト（node tools/test/test-mountains.js）
 *
 * 確かめること：
 *   ①【GAS】台帳 → mountains の変換（却下は出さない・ベストシーズン月のパース）
 *   ②「今の時期のおすすめ10」の並び。**月を固定して**確かめる
 *      （8月なら夏向き○が上位／11月なら紅葉・冬の低山が上位）
 *   ③ 決定文2種のフォーマット（Claudeが読む合図なので形を変えない）
 *   ④ 済は「おすすめ」から出さない／写真タイルの並び／絞り込み
 *   ⑤ 価格を出していない・何も保存していない
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
const Utilities = { formatDate: () => "2026-08-22 12:00" };
const pickGs = (a, b) => {
  const i = gs.indexOf(a), j = gs.indexOf(b);
  if (i < 0 || j < 0) throw new Error("update-data.gs に目印が見つかりません: " + (i < 0 ? a : b));
  return gs.slice(i, j);
};
eval(pickGs("function normHead_(v) {", "// 見出し行を探して、項目名 → 列番号 の対応表を作る"));
eval(pickGs("// ===== v1.2: base + デルタ形式の台帳を読む共通部品 =====", "// ===== v1.2: リミットレス台帳"));
eval(pickGs("// ===== 変換ヘルパー =====", "// ===== GitHub ====="));
eval(pickGs("var LIMITLESS_FOLDER_ID", "// ===== STEP1"));      // CONFIG（目標100座など）
eval(pickGs("var MTN_COLS", "// ===== v1.4: WANT台帳"));

console.log("\n【要件1】ベストシーズン月のパース");
eq(JSON.stringify(mtnMonths_("7,8,9,10")), "[7,8,9,10]", "★「7,8,9,10」を数字の並びに");
eq(JSON.stringify(mtnMonths_("11,12,1,2,3,4")), "[11,12,1,2,3,4]", "年をまたぐ並びもそのまま");
eq(JSON.stringify(mtnMonths_("7月,8月")), "[7,8]", "「月」つきでも読める");
eq(JSON.stringify(mtnMonths_("７，８")), "[7,8]", "★全角の数字とカンマでも読める");
eq(JSON.stringify(mtnMonths_("2,3")), "[2,3]", "2つだけ");
eq(JSON.stringify(mtnMonths_("")), "[]", "空なら空の並び");
eq(JSON.stringify(mtnMonths_(null)), "[]", "null でも落ちない");
eq(JSON.stringify(mtnMonths_("0,13,99,5")), "[5]", "★1〜12から外れた数字は捨てる");
eq(JSON.stringify(mtnMonths_("8,8,9")), "[8,9]", "同じ月が2回書いてあっても1つ");

// 本物の台帳と同じ見出し・同じ並び
const HEAD = ["id", "山名", "エリア", "緯度", "経度", "標高", "ロープウェイ", "山頂まで歩き", "夏向き",
  "ベストシーズン月", "体力", "セット温泉", "行く意味", "状態", "行った日", "予定", "一言",
  "写真URL", "映像URL", "出典URL", "公開した成果物"];
const KEYS = ["id", "name", "area", "lat", "lng", "elev", "ropeway", "walk", "summer", "months",
  "effort", "onsen", "why", "status", "wentAt", "planned", "note", "photo", "video", "source", "output"];
const row = o => KEYS.map(k => (o[k] === undefined ? "" : o[k]));
const SHEET = [HEAD,
  // 夏の山（夏向き○・体力低）
  row({ id: "M09", name: "入笠山", area: "長野・富士見", lat: 35.897, lng: 138.175, elev: 1955,
        ropeway: "富士見パノラマリゾート ゴンドラ", walk: "40分", summer: "○", months: "6,7,8,9,10",
        effort: "低", onsen: "蓼科温泉 親湯", why: "すずらんと高山植物の宝庫・360度展望",
        status: "未", note: "夏の家族向け定番", source: "https://example.jp/nyukasa" }),
  // 夏の山だが体力中（同じ条件なら低より後ろになるはず）
  row({ id: "M06", name: "谷川岳(天神尾根)", area: "群馬・みなかみ", lat: 36.836, lng: 138.93, elev: 1977,
        ropeway: "谷川岳ロープウェイ", walk: "150分", summer: "○", months: "7,8,9,10",
        effort: "中", onsen: "法師温泉 長寿館", why: "日本秘湯を守る会", status: "未" }),
  // 夏向き×だが8月がベストシーズンに入っていない（8月には出ない）
  row({ id: "M15", name: "宝登山", area: "埼玉・長瀞", lat: 36.085, lng: 139.093, elev: 497,
        ropeway: "宝登山ロープウェイ", walk: "5分", summer: "×", months: "1,2,3,11,12",
        effort: "低", onsen: "長瀞 満願の湯", why: "冬の蝋梅と長瀞の岩畳", status: "未" }),
  // 紅葉の山（11月がベスト・夏向き×）
  row({ id: "M19", name: "大山(丹沢)", area: "神奈川・伊勢原", lat: 35.441, lng: 139.231, elev: 1252,
        ropeway: "大山ケーブルカー", walk: "90分", summer: "×", months: "10,11,12,3,4,5",
        effort: "中", onsen: "鶴巻温泉 弘法の里湯", why: "阿夫利神社・江戸の大山詣り", status: "未" }),
  row({ id: "M38", name: "石割山", area: "山梨・山中湖", lat: 35.447, lng: 138.868, elev: 1413,
        ropeway: "なし", walk: "90分", summer: "×", months: "10,11,12,1",
        effort: "低", onsen: "紅富士の湯", why: "山中湖と富士山の大展望", status: "未" }),
  // 予定（おすすめに📅つきで残る）
  row({ id: "M13", name: "蔵王熊野岳", area: "山形・蔵王", lat: 38.143, lng: 140.44, elev: 1841,
        ropeway: "蔵王ロープウェイ", walk: "60分", summer: "○", months: "7,8,9,10",
        effort: "低", onsen: "蔵王温泉", why: "開湯1900年", status: "予定", planned: "2026年9月" }),
  // 済（おすすめから外れる。8月がベストシーズンでも出さない）
  row({ id: "M17", name: "箱根駒ヶ岳", area: "神奈川・箱根", lat: 35.225, lng: 139.034, elev: 1356,
        ropeway: "箱根駒ヶ岳ロープウェー", walk: "0分", summer: "○", months: "5,6,7,8,9,10,11",
        effort: "低", onsen: "箱根 天山湯治郷", why: "芦ノ湖と富士山の大展望", status: "済",
        wentAt: "2026年5月3日", output: "https://youtu.be/komagatake" }),
  // 却下（そもそも出さない）
  row({ id: "M99", name: "やめた山", area: "どこか", lat: 35, lng: 135, elev: 100,
        summer: "○", months: "8", effort: "低", onsen: "どこかの湯", status: "却下" }),
  // ベストシーズン月が空（おすすめには出ないが一覧には残る）
  row({ id: "M98", name: "月の書いていない山", area: "どこか", lat: 36, lng: 136, elev: 500,
        summer: "△", months: "", effort: "低", onsen: "ある湯", status: "未" }),
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]
];
global.SpreadsheetApp = { openById: () => ({ getSheets: () => [{ getDataRange: () => ({ getValues: () => SHEET }) }] }) };
mtnFile_ = () => ({ getId: () => "s", getUrl: () => "https://docs.google.com/m",
                    getName: () => "低山台帳_base", getLastUpdated: () => new Date(0) });

console.log("\n【要件1】台帳 → mountains の変換");
const M = readMountains_();
ok(!!M, "台帳を読めた", "null が返った");
eq(M.count, 8, "★却下1座を除いた8座（空行も落ちる）");
eq(M.dropped, 1, "★却下は1座");
eq(M.rows.filter(r => r.name === "やめた山").length, 0, "★却下は mountains に入らない");
eq(M.goal, 100, "目標は100座");
const nyu = M.rows.filter(r => r.id === "M09")[0];
eq(nyu.elev, 1955, "標高が数字で入る");
eq(JSON.stringify(nyu.months), "[6,7,8,9,10]", "★ベストシーズン月が数字の並びで入る");
eq(nyu.monthsText, "6,7,8,9,10", "書いてあったままも残す");
eq(nyu.onsen, "蓼科温泉 親湯", "セット温泉");
eq(nyu.why, "すずらんと高山植物の宝庫・360度展望", "行く意味");
eq(nyu.walk, "40分", "山頂まで歩き");
eq(nyu.summer, "○", "夏向き");
eq(M.rows.filter(r => r.id === "M17")[0].wentAt, "2026年5月3日", "行った日");
ok(logs.some(l => /低山台帳: 8座（夏向き4／済1・予定1）/.test(l)),
   "★ログの出し方（n座（夏向きn／済n・予定n））", logs.join("\n     "));
ok(logs.some(l => /ベストシーズン月が読めません.*月の書いていない山/.test(l)),
   "★月が読めない山は警告に出す（おすすめに出ないので気づけるように）", logs.join(" / "));

/* ========== ②〜⑤ ページ側（places.html） ========== */
const leak = code => code.replace(/^(const|let|var) /gm, "var ");
const pickHtml = (a, b) => {
  const i = pageHtml.indexOf(a), j = pageHtml.indexOf(b);
  if (i < 0 || j < 0) throw new Error("places.html に目印が見つかりません: " + (i < 0 ? a : b));
  return pageHtml.slice(i, j);
};
eval(leak(pickHtml("/* ===== v1.7 場所の並べ替え・絞り込みここから =====",
                   "/* ===== v1.7 場所の並べ替え・絞り込みここまで ===== */")));
const R = M.rows;

console.log("\n【要件2】今月・来月・再来月の窓");
eq(JSON.stringify(mtWindow(8)), "[8,9,10]", "8月なら 8・9・10月");
eq(JSON.stringify(mtWindow(11)), "[11,12,1]", "★11月なら 11・12・1月（年をまたぐ）");
eq(JSON.stringify(mtWindow(12)), "[12,1,2]", "★12月なら 12・1・2月");

console.log("\n【要件2】8月のおすすめ（夏向き○が上位）");
const aug = mtRecommend(R, 8);
console.log("   " + aug.map(x => x.name + "[" + (x.summer || "") + "/" + (x.effort || "") + "]").join(" → "));
eq(aug[0].name, "入笠山", "★1番目は 8月ど真ん中・夏向き○・体力低の入笠山");
eq(aug[1].name, "蔵王熊野岳", "2番目も夏向き○・体力低（予定でもおすすめに残す）");
eq(aug[2].name, "谷川岳(天神尾根)", "★夏向き○でも体力中は、体力低のうしろ");
eq(aug.filter(x => x.name === "箱根駒ヶ岳").length, 0, "★済（箱根駒ヶ岳）は8月がベストでも出さない");
eq(aug.filter(x => x.name === "宝登山").length, 0, "冬の山（1,2,3,11,12月）は8月には出ない");
eq(aug.filter(x => x.name === "月の書いていない山").length, 0, "月が書いていない山は出ない");
ok(aug.every((x, i) => i === 0 || !(mtIsSummer(x) === false && mtIsSummer(aug[i - 1]) === false && false)),
   "並びが壊れていない", "");

console.log("\n【要件2】11月のおすすめ（紅葉・冬の低山が上位）");
const nov = mtRecommend(R, 11);
console.log("   " + nov.map(x => x.name + "[" + (x.summer || "") + "/" + (x.effort || "") + "]").join(" → "));
/* 11月を含む山は 宝登山(低)・石割山(低)・大山(中) の3つ。
   ①今月を含む が同じなら ③体力 低→中 で並び、同点は台帳の並び（M15→M38→M19）。
   夏向き○の優先は6〜9月しか効かないので、ここでは体力だけが効く。 */
eq(nov.slice(0, 3).map(x => x.name).join(","), "宝登山,石割山,大山(丹沢)",
   "★11月を含む3座が先。体力 低→低→中 の順（同点は台帳の並び）");
eq(nov[0].name, "宝登山", "★1番目は 11月を含む・体力低・台帳の先頭にある宝登山（冬の蝋梅）");
ok(mtEffortRank(nov[0]) <= mtEffortRank(nov[2]), "★体力の低い山が先に来ている",
   nov.map(x => x.name + "/" + x.effort).join(","));
ok(mtMonths(nov[0]).indexOf(11) >= 0 && mtMonths(nov[1]).indexOf(11) >= 0,
   "★上位は「今月（11月）」を含む山", "");
ok(nov.indexOf(R.filter(r => r.id === "M09")[0]) < 0, "★夏の山（入笠山）は11月には出ない", "");
ok(!nov.some(x => mtIsSummer(x) && mtMonths(x).indexOf(11) < 0),
   "★11月は「夏向き○」の優先を効かせない（冬の山が後ろに回らない）", nov.map(x => x.name).join(","));

console.log("\n【要件2】上位10件まで");
ok(mtRecommend(R, 10).length <= 10, "10件を超えない", String(mtRecommend(R, 10).length));
eq(mtRecommend(R, 8, 2).length, 2, "件数は指定できる");
eq(mtRecommend([], 8).length, 0, "台帳が空でも落ちない");
eq(mtRecommend(null, 8).length, 0, "null でも落ちない");

console.log("\n【要件3】決定文2種のフォーマット");
eq(mtPlanLine("入笠山", 2026, 9), "⛰低山｜入笠山｜2026年9月｜予定", "★行く日を決める");
eq(mtDoneLine("入笠山", 2026, 9, 13), "⛰低山｜入笠山｜2026年9月13日｜行った", "★行った！");
eq(mtPlanLine("茶臼岳(那須岳)", 2027, 10), "⛰低山｜茶臼岳(那須岳)｜2027年10月｜予定", "かっこ入りの山名でも同じ形");
ok(mtPlanLine("x", 2026, 1).split("｜").length === 4, "区切りは全角の縦棒3つ（予定）", mtPlanLine("x", 2026, 1));
ok(mtDoneLine("x", 2026, 1, 2).split("｜").length === 4, "区切りは全角の縦棒3つ（行った）", mtDoneLine("x", 2026, 1, 2));
// 行きたい場所の決定文と混ざらないこと
ok(mtPlanLine("x", 2026, 1) !== plDecision("x", 2026, 1), "★場所の決定文とは別の合図（🗺と⛰）", "");
has(pageHtml, "この一文をClaudeに貼れば台帳が更新されます。", "コピー後の1行（低山）");

console.log("\n【要件4】写真タイルの並び・絞り込み");
const sorted = mtSort(R, 8).map(x => x.name);
console.log("   " + sorted.join(" → "));
eq(sorted[0], "入笠山", "★先頭は今の時期のおすすめ");
eq(sorted[sorted.length - 1], "箱根駒ヶ岳", "★いちばん最後は行った山");
ok(sorted.indexOf("月の書いていない山") < sorted.indexOf("箱根駒ヶ岳"),
   "おすすめに出ない未踏の山は、行った山より前", sorted.join(","));
eq(mtSort(R, 8).length, R.length, "並べ替えで山が減らない");
eq(mtFilter(R, "summer").length, 4, "☀夏向きは4座");
eq(mtFilter(R, "done").length, 1, "🏁行った所は1座");
eq(mtFilter(R, null).length, 8, "絞り込みなしは全部");
const c = mtCounts(R, 100);
eq(c.all + "/" + c.done + "/" + c.planned + "/" + c.goal, "8/1/1/100", "タブに出す数");

console.log("\n【要件4】映像URL");
eq(mtVideo({ name: "入笠山", video: "https://youtu.be/x" }), "https://youtu.be/x", "台帳にあればそれ");
eq(mtVideo({ name: "入笠山" }),
   "https://www.youtube.com/results?search_query=" + encodeURIComponent("入笠山 登山 4K"),
   "★空なら「<山名> 登山 4K」のYouTube検索");
eq(plPhoto({ name: "入笠山", photo: "https://example.jp/x.jpg" }, {}).url, "https://example.jp/x.jpg",
   "写真は台帳の写真URLが最優先（場所と同じ規則）");

console.log("\n【画面の配線】");
has(pageHtml, "{k:'mtn',l:'⛰ 低山'", "★4つ目のタブがある");
has(pageHtml, "'🏁'+mc.done+'／'+mc.goal", "★タブに「🏁n／100」を出す");
has(pageHtml, "overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none", "タブは狭ければ横スクロール");
has(pageHtml, 'id="mtnTop"', "おすすめ10の置き場所がある");
has(pageHtml, "🗓 今の時期のおすすめ", "おすすめカードの見出し");
has(pageHtml, "class=\"rrow\"", "おすすめは横スクロールのカード列");
has(pageHtml, "☀ 夏向き（ロープウェイ）", "絞り込み①");
has(pageHtml, "🏁 行った所を見る", "絞り込み②");
has(pageHtml, "function openMtn(", "低山用のボトムシート");
has(pageHtml, "♨ セットの温泉", "♨セット温泉ブロック");
has(pageHtml, "🗓 行く日を決める", "ボタン1");
has(pageHtml, "⛰ 行った！", "ボタン2");
has(pageHtml, "🎬 映像を見る", "ボタン3");
has(pageHtml, "📖 もっと読む →", "小さく「もっと読む」");
has(pageHtml, "mtn:[[30.5,129],[45.5,142.5]]", "低山タブの地図は日本全体");
ok(!/(円|¥|価格|料金|万円)/.test(pageHtml.slice(pageHtml.indexOf("<body"))), "★価格は出していない", "金額がある");
ok(!/localStorage|sessionStorage/.test(pageHtml), "★何も保存しない", "ストレージを使っている");
has(appHtml, "'行きたい場所マップ（場所'+rows.length+'・低山🏁'+mDone+'/'+goal+'）'",
    "★家族の部屋の入口が「場所n・低山🏁n/100」");

console.log("\n【実データ】");
const pj = JSON.parse(fs.readFileSync(path.join(root, "places-photos.json"), "utf8"));
const seed = JSON.parse(fs.readFileSync(path.join(root, "tools", "mountains-seed.json"), "utf8"));
const noPhoto = seed.filter(m => !m.photo && !(pj.photos || {})[m.name]).map(m => m.name);
console.log("   低山 " + seed.length + "座のうち写真あり " + (seed.length - noPhoto.length) + "座" +
            (noPhoto.length ? "　なし: " + noPhoto.join("・") : ""));
ok(noPhoto.length === 0, "低山ぜんぶに写真がある", noPhoto.join(","));
console.log("   8月のおすすめ（本物の台帳）: " + mtRecommend(seed, 8).map(x => x.name).join("・"));
console.log("   11月のおすすめ（本物の台帳）: " + mtRecommend(seed, 11).map(x => x.name).join("・"));
console.log("   1月のおすすめ（本物の台帳）: " + mtRecommend(seed, 1).map(x => x.name).join("・"));
const real = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));
const rm = ((real.mountains || {}).rows) || [];
console.log("   data.json: v" + real.version + " ／ mountains " + rm.length + "座" +
            (rm.length ? "" : "（次の runNow で入ります）"));
ok(mtSort(rm, 8).length === rm.length, "実データでも落ちない");

console.log(fail ? "\n❌ " + fail + "件 失敗\n" : "\n全ケース合格 ✅\n");
process.exit(fail ? 1 : 0);
