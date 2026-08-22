/**
 * v1.6.1 未来のはしご（5段）と軸の切り出しのテスト
 *   （node tools/test/test-future.js）
 *
 * きっかけ：家画面の「🔭未来（健康）」のはしごボタンが87・77・72・67の4つになった。
 * 真因はCSSではなく **Apps Script の読み取り**。未来ビジョン台帳v3.3で62歳の行が
 *   「62歳(2031)【v3.3・本人口述で塗り重ね】: …」
 * と、年かっこと「:」のあいだに注記が入る書き方になり、正規表現が当たらず
 * **62歳の段が丸ごと落ちていた**（live data.json の ladder が4段だった）。
 *
 * 確かめること：
 *   ①【GAS】v3.3の本物の行から、はしごが**5段**読める（61歳の中間旗は別枠のまま）
 *   ②【アプリ】62歳の段から、各部屋が**自分の軸だけ**を切り出す（【◯◯軸】〜次の【）
 *   ③【アプリ】軸の無い部屋は前書きに落ちる／72歳の書き方でも壊れない
 *   ④【見た目】はしご5つがスマホ幅（390px）に横一列で収まり、
 *      入らないときは**折り返す**（overflow:hidden で隠さない）
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
const has = (hay, needle, name) => ok(String(hay).indexOf(needle) >= 0, name, "「" + needle + "」が無い\n     本文: " + hay);

/* ========== Apps Script 側 ========== */
const logs = [];
const Logger = { log: m => logs.push(String(m)) };
const pickGs = (a, b) => {
  const i = gs.indexOf(a), j = gs.indexOf(b);
  if (i < 0 || j < 0) throw new Error("update-data.gs に目印が見つかりません: " + (i < 0 ? a : b));
  return gs.slice(i, j);
};
eval(pickGs("// ===== v1.2: 未来ビジョン台帳（Googleドキュメント） =====",
            "// ===== v1.2: base + デルタ形式の台帳を読む共通部品 ====="));

/* 未来ビジョン台帳_2026-08-22（油絵v3.3）の本物の行。
   Driveのテキスト書き出しは箇条書きの記号や字下げが版によって変わるので、
   parser 側が落とす記号（- ・ 空白）を混ぜたまま渡して、それでも読めることを確かめる。 */
const DOC = [
  "未来ビジョン台帳（2026-08-22版・油絵v3.3）",
  "",
  "1. 87歳(2056年)の完成図 — 6つの部屋",
  "1階・健康(大黒柱)",
  "  - 毎朝3〜5kmの散歩。足元ふらつかず、筋力があり、毎日行く場所がある",
  "  - 巡航目標値: 体重78kg(理想)〜72kg(本音)",
  "1階・精神/心【v3.1でグル化・v3.2で日課確定】",
  "  - 30年後の姿: すれ違うだけで、呪縛からの解放がされてしまうグル的な存在",
  "2階・仕事",
  "  - 2030/4/29(60歳最後の日)にUdemy100・Kindle100完成",
  "3階・経済",
  "  - 87歳の暮らし: 世間平均の3倍(月75万・年900万規模)で「十分にご機嫌」",
  "",
  "2. サブゴールのはしご(バックキャスト)",
  "  - 87歳(2056): 完成図。【精神軸】佇まい・伝説・分身の三位一体=すれ違いで解放が起きる",
  "  - 77歳(2046): 旅の10年完走直後。【精神軸】「解放の学派」が本人不在でも回る",
  "  - 72歳(2041): 旅の10年ど真ん中。年1回・100日の旅。脚は20kmウォーク級維持。【経済軸・v3.3】中島マンションの賞味期限(築65年)。年360万の家賃が消える年として織り込む",
  "  - 67歳(2036): 旅の10年2〜3周目。完全資産型ほぼ完成。【精神軸】中島イズムの体系化=呪縛の分類学と解放の技術大全が完成。【経済軸・v3.3】中島マンションの出口を決める年(税理士+子ども3人)",
  "  - 62歳(2031)【v3.3・本人口述で塗り重ね】: 資産化工事の年。【仕事軸】企業研修の壇上にはもういない。Udemy・YouTubeで40代中盤〜50代にグルとして発言し、多くの人の生き抜く力をバージョンアップしている。【家族・趣味軸】時間の9割は遊び=体験。年間累積3ヶ月(1週間×12回)の旅で世界・日本の行きたい所に行けている。【健康軸】100kmウォーク年1回、毎日3〜5km、週1で10km。健康で生活リズム・睡眠が整っている。【経済軸】何もしなくても年1,000万の基盤(Udemy・マンション・国債の3本)がほぼ形になっている。【精神軸】「作る人→在る人」転換元年。グルの日課7が5年継続済みの状態で突入",
  "  - 61歳最後の日(2030/4/29): Udemy100・Kindle100完成【既定の中間旗】",
  "  - 原則: 最初の5年に最大の成長率。健康を楽観視せず、動けるうちに前倒し",
  "",
  "4. 週報への実装(87歳からのフィードバック)",
  "  - 採点軸: ①太もも・脚力に投資したか ②100作品の発電所建設 ③資産化工事 ④家族の楽しみの確定 ⑤生き生き・わくわく・どきどき",
  "  - 口調: おおらかで優しいギバーの87歳が「動けるうちに前倒しだよ」と背中を押す"
].join("\n");

// Drive を叩かずに readFuture_ をそのまま動かす（読み取り部分だけ差し替える）
findFutureDoc_ = () => ({
  getId: () => "doc-v33", getName: () => "未来ビジョン台帳_2026-08-22",
  getUrl: () => "https://docs.google.com/document/d/doc-v33/edit"
});
fetchDocText_ = () => DOC;

console.log("\n【要件1】v3.3の台帳から、はしごが5段そろって読める");
const F = readFuture_();
ok(!!F, "台帳を読めた", "null が返った");
eq(F.ladder.length, 5, "★はしごは5段（62歳が落ちない）");
eq(F.ladder.map(x => x.age).join(","), "87,77,72,67,62", "★87→62の並び");
eq(F.ladder.map(x => x.year).join(","), "2056,2046,2041,2036,2031", "年もそろっている");
const r62 = F.ladder.filter(x => x.age === 62)[0];
has(r62.text, "【健康軸】", "★62歳の本文に【健康軸】が入っている");
has(r62.text, "【仕事軸】", "62歳の本文に【仕事軸】が入っている");
ok(r62.text.indexOf("【v3.3・本人口述で塗り重ね】") < 0,
   "★年かっこのあとの注記は本文に混ざらない", r62.text.slice(0, 40));
// 中間旗の日付は「2030/4/29」→「2030-4-29」（0埋めしないのは前からの挙動。画面には出していない）
ok(!!F.flag && F.flag.date === "2030-4-29", "61歳最後の日は中間旗として別に拾う", JSON.stringify(F.flag));
eq(F.ladder.filter(x => x.age === 61).length, 0, "★中間旗ははしごの段に混ざらない");
eq(Object.keys(F.rooms).length, 4, "部屋の完成図もこれまでどおり読める（健康・精神・仕事・経済）");
eq(F.axes.length, 5, "採点軸も読める");

console.log("\n【要件1】昔の書き方（注記なし）も引き続き読める");
fetchDocText_ = () => "2. サブゴールのはしご(バックキャスト)\n  - 62歳(2031): 資産化工事の年。【精神軸】転換元年";
const Fold = readFuture_();
eq(Fold.ladder.length, 1, "注記の無い行もこれまでどおり1段として読める");
eq(Fold.ladder[0].text, "資産化工事の年。【精神軸】転換元年", "本文もそのまま");

/* ========== アプリ側（index.html） ========== */
const leak = code => code.replace(/^(const|let) /gm, "var ");
const pickHtml = (a, b) => {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0) throw new Error("index.html に目印が見つかりません: " + (i < 0 ? a : b));
  return html.slice(i, j);
};
eval(leak(pickHtml("/* ===== util ===== */", "/* ===== init")));
eval(leak(pickHtml("/* ===== v1.6 会食予実（枠・予約・実績）ここから =====",
                   "/* ===== v1.6 会食予実 ここまで ===== */")));
eval(leak(pickHtml("/* ===== 6部屋コックピット ここから =====", "/* ===== 6部屋コックピット ここまで ===== */")));

const D = { future: F };

console.log("\n【要件2】62歳の段から、各部屋が自分の軸だけを切り出す");
has(ckLadder(D, "health", 62), "100kmウォーク年1回", "★健康＝【健康軸】の文");
ok(ckLadder(D, "health", 62).indexOf("企業研修") < 0,
   "★健康の欄に仕事の話が混ざらない", ckLadder(D, "health", 62));
ok(ckLadder(D, "health", 62).indexOf("【") < 0, "★軸の見出し【】は本文に残さない", ckLadder(D, "health", 62));
has(ckLadder(D, "work", 62), "企業研修の壇上にはもういない", "仕事＝【仕事軸】の文");
has(ckLadder(D, "work", 62), "バージョンアップしている", "★軸の中の2文目まで拾う（次の【までを切り出す）");
has(ckLadder(D, "priv", 62), "時間の9割は遊び", "家族＝【家族・趣味軸】の文");
has(ckLadder(D, "eco", 62), "年1,000万の基盤", "経済＝【経済軸】の文");
has(ckLadder(D, "spirit", 62), "「作る人→在る人」転換元年", "精神＝【精神軸】の文");
eq(ckLadder(D, "know", 62), "資産化工事の年", "★軸の無い知識は「前書き」に落ちる");

console.log("\n【要件2】軸の見出しに注記が付いていても読める（72歳・67歳）");
has(ckLadder(D, "eco", 72), "中島マンションの賞味期限", "★【経済軸・v3.3】でも経済に届く");
eq(ckLadder(D, "health", 72), "脚は20kmウォーク級維持", "★軸の無い健康は前書きから脚の話を選ぶ");
has(ckLadder(D, "spirit", 67), "中島イズムの体系化", "67歳の精神軸");
has(ckLadder(D, "eco", 67), "出口を決める年", "67歳の経済軸");

console.log("\n【要件2】軸→部屋の対応と、注記を軸と間違えないこと");
eq(ckAxisRoom("健康軸"), "health", "健康軸");
eq(ckAxisRoom("家族・趣味軸"), "priv", "家族・趣味軸");
eq(ckAxisRoom("経済軸・v3.3"), "eco", "注記つきの経済軸");
eq(ckAxisRoom("精神軸"), "spirit", "精神軸");
eq(ckAxisRoom("v3.3・本人口述で塗り重ね"), "null", "★「軸」と書いていない注記は軸にしない");
eq(ckAxisRoom("既定の中間旗"), "null", "中間旗の注記も軸にしない");
eq(ckLadderParts("軸の無い一文だけ").pre, "軸の無い一文だけ", "【】が1つも無くても落ちない");
eq(Object.keys(ckLadderParts("").byRoom).length, 0, "空文字でも落ちない");

console.log("\n【要件3】87歳は部屋の完成図をそのまま出す（これまでどおり）");
has(ckLadder(D, "health", 87), "毎朝3〜5kmの散歩", "87歳の健康は完成図の1行目");

/* ---------- ④ 見た目：はしご5つがスマホ幅に収まる ---------- */
console.log("\n【要件4】はしご5つがスマホ幅（390px）に収まる／収まらなければ折り返す");
// ボタンは ckAges()（＝ladderの段）を1つずつ回して作るので、段数＝ボタン数
has(html, "function ckAges(){ return ((DATA.future&&DATA.future.ladder)||[]).map(x=>x.age); }",
    "ボタンははしごの段数ぶん作る");
has(html, "'<div class=\"lad\">'+ages.map(a=>{", "はしごの段を1つずつボタンにしている");
eq(F.ladder.length, 5, "★はしごボタンは5つ");
const ladCss = (html.match(/\.lad\{[^}]*\}/) || [""])[0];
const btnCss = (html.match(/\.lad button\{[^}]*\}/) || [""])[0];
has(ladCss, "flex-wrap:wrap", "★入らないときは折り返す（隠さない）");
ok(!/overflow\s*:\s*hidden/.test(ladCss) && !/overflow\s*:\s*hidden/.test(btnCss),
   "★overflow:hidden で押し出されたボタンを隠していない", ladCss + " / " + btnCss);
/* flex の中身は既定が min-width:auto ＝「中の文字より細くならない」。
   ここを明示しないと、幅が足りないときに縮まず、折り返しもせず押し出されてしまう。
   0 にすると際限なく細くなって文字がつぶれるので、**5つ並ぶ最小幅**を床にして、
   それより狭い端末では折り返させる。 */
ok(/min-width:\s*\d/.test(btnCss), "★min-width を明示している（既定の auto に任せない）", btnCss);
const gap = parseFloat((ladCss.match(/gap:\s*(\d+(?:\.\d+)?)px/) || [0, 0])[1]);
const minW = parseFloat((btnCss.match(/min-width:\s*(\d+(?:\.\d+)?)px/) || [0, 0])[1]);
/* 幅390pxのiPhoneでの実測値（playwrightで計測）。
   ページの余白＋カードの余白を引いた、はしごが使える横幅。 */
const LAD_W_AT_390 = 332;
const need = minW * 5 + gap * 4;
ok(minW > 0 && need <= LAD_W_AT_390,
   "★5つ×" + minW + "px＋隙間" + gap + "px×4＝" + need + "px が、幅390pxの使える横幅" +
   LAD_W_AT_390 + "px に収まる", "はみ出す: " + need + "px > " + LAD_W_AT_390 + "px");
has(btnCss, "font-size:10px", "年号の文字を1段下げた");

/* ---------- 実データ ---------- */
console.log("\n【実データ】いま公開中の data.json を素通しして落ちないか");
const real = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));
const ages = ((real.future || {}).ladder || []).map(x => x.age);
console.log("   形式 v" + real.version + " ／ 台帳 " + ((real.future || {}).docTitle || "—") +
            " ／ はしご " + ages.join("・") + "（" + ages.length + "段）");
["health", "work", "priv", "eco", "spirit", "know"].forEach(r => {
  const a = ages[ages.length - 1];
  if (a != null) console.log("   " + a + "歳 " + r + ": " + String(ckLadder(real, r, a)).slice(0, 46));
});
ok(true, "実データでも落ちない（段数は次の runNow で5段になる）");

console.log(fail ? "\n❌ " + fail + "件 失敗\n" : "\n全ケース合格 ✅\n");
process.exit(fail ? 1 : 0);
