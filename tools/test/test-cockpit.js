/**
 * 6部屋コックピット（未来のはしご＋87歳の声）のテスト
 *   node tools/test/test-cockpit.js
 *
 * index.html の「6部屋コックピット ここから 〜 ここまで」を切り出して動かす。
 * 判定はすべて固定の作り物データ。実データ(data.json)は最後に素通し確認だけ。
 *
 * 確かめること：
 *   ・未来のはしご … 87歳はその部屋の完成図、それ以外は部屋に関係する一文を選ぶ
 *   ・87歳の声    … 部屋ごとの直近データを5軸と突合し、エール／アラームを出し分ける
 *   ・週の集計    … リミットレス台帳の6分類カウントとギバー度（直近7日）
 */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "..");
const src = fs.readFileSync(path.join(root, "index.html"), "utf8");

const pick = (a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b);
  if (i < 0 || j < 0) throw new Error("index.html に目印が見つかりません: " + (i < 0 ? a : b));
  return src.slice(i, j);
};
const leak = code => code.replace(/^(const|let) /gm, "var ");

// 「/* ===== init」までを切り出す（見出しの後半は変わることがあるので前方一致で拾う）
eval(leak(pick("/* ===== util ===== */", "/* ===== init")));
eval(leak(pick("/* ===== 分析メモ（4視点）ここから =====", "/* ===== 分析メモ ここまで ===== */")));
eval(leak(pick("/* ===== 6部屋コックピット ここから =====", "/* ===== 6部屋コックピット ここまで ===== */")));

let fail = 0;
const ok = (cond, name, detail) => {
  console.log((cond ? "✅ " : "❌ ") + name + (cond ? "" : "\n     " + detail));
  if (!cond) fail++;
};
const eq = (got, want, name) => ok(String(got) === String(want), name, "結果=" + got + "  期待=" + want);
const has = (text, word, name) => ok(String(text).indexOf(word) >= 0, name, "この語が無い: " + word + "\n     本文: " + text);

/* ================= 作り物データ ================= */
const LADDER = [
  { age: 87, year: 2056, text: "87歳の完成図。1階が満ちて2階が立ち、3階が実る" },
  { age: 77, year: 2046, text: "旅の10年を完走直後。海外100日旅→国内温泉シフト。資産三本柱が支え切った実績" },
  { age: 72, year: 2041, text: "旅の10年のど真ん中。年1回・200〜300万の旅。脚は20kmウォーク級で維持。ゆるりんちょ=夫婦世界旅チャンネル化" },
  { age: 67, year: 2036, text: "旅の10年2〜3周目。100kmウォークは65歳で卒業済み。完全資産型がほぼ完成" },
  { age: 62, year: 2031, text: "100作品完成の翌年=「資産化工事」の年。金融資産積み上げ本格化。100kmウォーク現役" }
];
const ROOM_BULLETS = {
  health: ["毎朝3〜5kmの散歩。足元ふらつかない", "ピンピンコロリ"],
  spirit: ["おおらかで人に優しいギバー"],
  know:   ["最先端AIとの協働を学び続ける"],
  work:   ["Udemy100・Kindle100が旅の10年を支える発電所"],
  priv:   ["子ども3人の結婚と孫6〜7人"],
  eco:    ["世間平均の3倍で十分にご機嫌"]
};

// 8/1〜8/13の健康記録。体重82.0で一定、筋肉量だけ最後に+0.2、運動は8/10の1日だけ
function healthRows() {
  const out = [];
  for (let d = 1; d <= 13; d++) {
    const ds = "2026-08-" + String(d).padStart(2, "0");
    out.push({
      date: ds, dow: "-", weight: 82.0, muscle: d === 13 ? 55.2 : 55.0,
      mood: null, sleep: 70, exercise: d === 10 ? "ウォーキング5km" : null,
      dining: null, note: null
    });
  }
  return out;
}
const LIMITLESS = [
  { date: "2026-08-02", kinds: ["学び"], text: "7日より前の学び", who: null },
  { date: "2026-08-08", kinds: ["教え"], text: "Aさんに教えた", who: "Aさん" },
  { date: "2026-08-09", kinds: ["教え"], text: "Bさんに教えた", who: "Bさん" },
  { date: "2026-08-10", kinds: ["初めて", "トライ"], text: "初挑戦した", who: null },
  { date: "2026-08-11", kinds: ["学び"], text: "学んだ", who: null }
];
// Udemy: N01が新作(公開2026/6)、P01〜P03が過去作。③の月齢比較が効くようにする
const U_COURSES = [
  { id: "N01", short: "新作", published: "2026/6" },
  { id: "P01", short: "過去1", published: "2024/6" },
  { id: "P02", short: "過去2", published: "2023/6" },
  { id: "P03", short: "過去3", published: "2022/6" }
];
const U_MONTHLY = [
  ["2022-06", { P03: 100 }], ["2022-07", { P03: 400 }], ["2022-08", { P03: 1000 }],
  ["2023-06", { P02: 100 }], ["2023-07", { P02: 400 }], ["2023-08", { P02: 1200 }],
  ["2024-06", { P01: 100 }], ["2024-07", { P01: 400 }], ["2024-08", { P01: 1400 }],
  ["2026-06", { N01: 0 }], ["2026-07", { N01: 100 }], ["2026-08", { N01: 300 }]
].map(([ym, by]) => ({
  ym: ym, byCourse: Object.keys(by).reduce((o, id) => { o[id] = { enroll: by[id] }; return o; }, {})
}));
function snaps(lastDelta) {
  const mk = (date, add) => ({
    date: date, time: "8:00",
    rows: U_COURSES.map(c => ({ id: c.id, cumEnroll: 1000 + add, cumRevenue: 100, rating: 4.1 }))
  });
  return [mk("2026-08-12", 0), mk("2026-08-13", lastDelta)];
}

function fixture() {
  return {
    generatedAt: "2026-08-13T08:30:00+09:00",
    health: healthRows(),
    future: { docTitle: "未来ビジョン台帳_テスト", docUrl: "https://example.test/doc",
              ladder: LADDER, axes: ["a", "b", "c", "d", "e"],
              rooms: Object.keys(ROOM_BULLETS).reduce((o, k) => {
                o[k] = { heading: k, bullets: ROOM_BULLETS[k].slice() }; return o; }, {}) },
    limitless: { baseName: "テスト台帳", rows: LIMITLESS.map(r => Object.assign({}, r)) },
    eco: { baseName: "経済台帳_base", rows: [] },
    links: { health: { label: "GOKIGEN台帳", url: "https://example.test/h" } },
    udemyCourses: U_COURSES.map(c => Object.assign({}, c)),
    udemyMonthly: JSON.parse(JSON.stringify(U_MONTHLY)),
    udemy: snaps(5)
  };
}
const clone = d => JSON.parse(JSON.stringify(d));
const lastHealth = d => d.health[d.health.length - 1];

/* ================= 週の集計 ================= */
console.log("\n【リミットレス台帳の集計】");
const F = fixture();
eq(JSON.stringify(ckKinds(F, 7)), JSON.stringify({ 教え: 2, 初めて: 1, トライ: 1, 学び: 1 }),
   "直近7日の6分類カウント（8/2の学びは範囲外）");
eq(ckKinds(F, 14)["学び"], 2, "14日にすると8/2の学びも入る");
eq(ckGiver(F, 7).count, 2, "ギバー度＝直近7日の🗣️教えの件数");
eq(ckGiver(F, 7).who.length, 2, "ギバー度の相手は2組");
eq(ckExercise(F, 7), 1, "運動の記録がある日数（直近7日）");
eq(ckRows(F, 7).length, 4, "直近7日の行数");

/* ================= 未来のはしご ================= */
console.log("\n【未来のはしご】");
eq(ckLadder(F, "health", 87), "毎朝3〜5kmの散歩。足元ふらつかない", "★87歳はその部屋の完成図を出す");
eq(ckLadder(F, "eco", 87), "世間平均の3倍で十分にご機嫌", "★部屋ごとに87歳の中身が変わる");
eq(ckLadder(F, "health", 72), "脚は20kmウォーク級で維持", "★72歳は健康に関係する一文だけを選ぶ");
eq(ckLadder(F, "work", 72), "ゆるりんちょ=夫婦世界旅チャンネル化", "★同じ72歳でも仕事は別の一文を選ぶ");
eq(ckLadder(F, "eco", 72), "年1回・200〜300万の旅", "★経済はお金の一文を選ぶ");
eq(ckLadder(F, "health", 67), "100kmウォークは65歳で卒業済み", "67歳も部屋ごとに選ぶ");
eq(ckLadder(F, "health", 77), "旅の10年を完走直後", "当てはまる一文が無ければ、その年齢の見出しの一文にする");
eq(ckLadder(F, "health", 99), null, "はしごに無い年齢は null");
const noFuture = fixture(); delete noFuture.future;
eq(ckLadder(noFuture, "health", 87), null, "未来ビジョン台帳が無ければ null（画面は準備中表示）");

/* ================= 87歳の声 ================= */
console.log("\n【87歳の声・健康】");
const vh = ckVoice(F, "health");
eq(vh.tone, "yell", "筋肉量が増えていればエール");
has(vh.text, "筋肉量が+0.2kg", "筋肉量の方向を数字で言う");
eq(vh.axis, "太もも・脚力への投資", "見ている軸を持つ");

const peak = clone(F); lastHealth(peak).weight = 83.5;      // 直近7回平均+1.5kg
const vpeak = ckVoice(peak, "health");
eq(vpeak.tone, "alarm", "★体重が直近7回平均より1kg以上ならアラーム");
has(vpeak.text, "1.5kg上、山のてっぺん", "乖離を数字で言い、責めずに笑う");
has(vpeak.text, "歩こうか", "次の一歩を1つだけ示す");

const noWalk = clone(F); noWalk.health.forEach(r => r.exercise = null);
has(ckVoice(noWalk, "health").text, "この2週間、歩いた記録が1日もない", "★運動の記録が2週間ゼロならアラーム");
eq(ckVoice(noWalk, "health").tone, "alarm", "歩いていない日が続けばアラーム");

const muscleDown = clone(F);
muscleDown.health.forEach(r => r.exercise = null);
muscleDown.health[muscleDown.health.length - 1].muscle = 54.5;
muscleDown.health[5].exercise = "ジム";                      // 14日内に1回だけ、7日内は0回
has(ckVoice(muscleDown, "health").text, "減るのはあっという間", "筋肉量が減っていて歩けていなければアラーム");

console.log("\n【87歳の声・知識】");
const vk = ckVoice(F, "know");
eq(vk.tone, "yell", "初めて・トライ・学びが揃っていればエール");
has(vk.text, "初めて1・トライ1・学び1件", "6分類の数を読み上げる");

const noDoki = clone(F);
noDoki.limitless.rows = LIMITLESS.filter(r => r.kinds.indexOf("初めて") < 0 && r.kinds.indexOf("トライ") < 0);
has(ckVoice(noDoki, "know").text, "「初めて」も「トライ」もゼロ", "★どきどきがゼロならアラーム");

const noManabi = clone(F);
noManabi.limitless.rows = LIMITLESS.filter(r => r.kinds.indexOf("学び") < 0);
has(ckVoice(noManabi, "know").text, "やりっぱなしはもったいない", "トライだけで学びが無ければアラーム");

const emptyWeek = clone(F); emptyWeek.limitless.rows = [];
has(ckVoice(emptyWeek, "know").text, "台帳が空っぽ", "台帳に何も無い週はそれを言う");

console.log("\n【87歳の声・精神】");
const vs = ckVoice(F, "spirit");
eq(vs.tone, "yell", "人に教えていればエール");
has(vs.text, "今週は2回、2組の相手に手渡した", "★ギバー度を読み上げる");

const noGive = clone(F);
noGive.limitless.rows = LIMITLESS.filter(r => r.kinds.indexOf("教え") < 0);
has(ckVoice(noGive, "spirit").text, "ギバーの電池", "★誰にも教えていない週はアラーム");

const lowMood = clone(F); lastHealth(lowMood).mood = 4;
const vlow = ckVoice(lowMood, "spirit");
eq(vlow.tone, "alarm", "ご機嫌度が低い日はアラーム");
has(vlow.text, "ご機嫌度が4/10", "ご機嫌度を責めずに受け止める");
has(vlow.text, "無理に上げなくていい", "口調はおおらかで優しい");

console.log("\n【87歳の声・仕事】");
const vw = ckVoice(F, "work");
eq(vw.tone, "alarm", "★新作が同月齢の過去作の半分未満ならアラーム");
has(vw.text, "過去作の25%", "何%かを言う（300人 ÷ 中央値1,200人）");
has(vw.text, "告知だけは前倒し", "打ち手を1つ示す");

const goodLaunch = clone(F);
goodLaunch.udemyMonthly[goodLaunch.udemyMonthly.length - 1].byCourse.N01.enroll = 1200;
const vw2 = ckVoice(goodLaunch, "work");
eq(vw2.tone, "yell", "立ち上がりが並なら、増分を見てエール");
has(vw2.text, "前回から+20人", "全4コースの増分を合計する（+5人×4）");

const flat = clone(goodLaunch); flat.udemy = snaps(0);
eq(ckVoice(flat, "work").tone, "alarm", "登録が増えていなければアラーム");

console.log("\n【87歳の声・家族】");
const famPlan = clone(F);
lastHealth(famPlan).note = "体重84.2kg。明日8/14から那須岳family旅行(茶臼岳)。夜は早く寝る";
const vp = ckVoice(famPlan, "priv");
eq(vp.tone, "yell", "これからの家族の予定があればエール");
has(vp.text, "明日8/14から那須岳family旅行(茶臼岳)", "★台帳の一言から次の家族の楽しみを拾う");
eq(ckNextFamily(famPlan).date, "2026-08-13", "拾った一言の日付を持つ");

const oldPlan = clone(F);
oldPlan.health[0].note = "明日は家族で温泉";                  // 3日より前の一言は見ない
eq(ckNextFamily(oldPlan), null, "古い一言からは予定を拾わない（直近3日ぶんだけ見る）");
has(ckVoice(oldPlan, "priv").text, "食卓を囲んでない", "★家族枠が0で予定も無ければアラーム");

const famUsed = clone(F);
famUsed.health[9].dining = "家族(すきっぱー)";
const vf = ckVoice(famUsed, "priv");
eq(vf.tone, "yell", "今月すでに家族と会食していればエール");
has(vf.text, "今月は家族と1回", "会食欄から家族枠を数える");

console.log("\n【87歳の声・経済】");
const ve = ckVoice(F, "eco");
eq(ve.tone, "alarm", "★経済台帳が空なら、まず1行書こうとうながす");
has(ve.text, "入口ができたね", "入口ができたことを認めてから促す");
has(ve.text, "数えられないものは、増やせない", "87歳らしい言い方で");

const ecoFilled = clone(F);
ecoFilled.eco.rows = [{ date: "2026-08-13", name: "国債", cat: "債券", amount: 3000000, currency: "JPY" },
                      { date: "2026-08-13", name: "普通預金", cat: "現金", amount: 2000000, currency: "JPY" }];
const ve2 = ckVoice(ecoFilled, "eco");
eq(ve2.tone, "yell", "行が入ればエールに変わる");
has(ve2.text, "資産は5,000,000", "評価額を合計する");

console.log("\n【全部屋そろっているか】");
["health", "know", "spirit", "work", "priv", "eco"].forEach(r => {
  const v = ckVoice(F, r);
  ok(v && v.text && v.text.length > 10 && (v.tone === "yell" || v.tone === "alarm"),
     CK_ROOMS[r].label + "：声が1行出る（" + (v ? v.tone : "なし") + "）", JSON.stringify(v));
  ok(v.axis && v.axis.length > 0, CK_ROOMS[r].label + "：見ている軸を持つ", JSON.stringify(v));
  ok(ckLadder(F, r, 87) && ckLadder(F, r, 62), CK_ROOMS[r].label + "：87歳と62歳のはしごが出る", "");
});
eq(ckVoice(F, "unknown"), null, "知らない部屋なら null");

/* ================= Apps Script側の読み取り（Driveの要らない部分だけ） ================= */
console.log("\n【Apps Script: 台帳の読み分け】");
(function () {
  const gs = fs.readFileSync(path.join(root, "tools", "update-data.gs"), "utf8");
  const cut = (a, b) => gs.slice(gs.indexOf(a), gs.indexOf(b));
  const Logger = { log: () => {} };
  eval(cut("function futureSection_", "function readFuture_"));
  eval(cut("/** 見出し行を探し", "// ===== v1.2: リミットレス台帳"));
  eval(cut("var LIMITLESS_KINDS", "function readLimitless_"));
  eval(cut("var ECO_COLS", "function readEco_"));
  eval(cut("// 見出しのゆらぎを吸収する", "// 見出し行を探して"));

  eq(futureRoom_("1階・健康(大黒柱)"), "health", "見出し「1階・健康」→ 健康の部屋");
  eq(futureRoom_("1階・精神/心"), "spirit", "見出し「1階・精神/心」→ 精神の部屋");
  eq(futureRoom_("1階・知識/教養"), "know", "見出し「1階・知識/教養」→ 知識の部屋");
  eq(futureRoom_("2階・仕事"), "work", "見出し「2階・仕事」→ 仕事の部屋");
  eq(futureRoom_("2階・家族/趣味"), "priv", "見出し「2階・家族/趣味」→ 家族の部屋");
  eq(futureRoom_("3階・経済"), "eco", "見出し「3階・経済」→ 経済の部屋");
  eq(futureSection_("1. 87歳(2056年)の完成図 — 6つの部屋"), "rooms", "章の見分け: 完成図");
  eq(futureSection_("2. サブゴールのはしご(バックキャスト)"), "ladder", "章の見分け: はしご");
  eq(futureSection_("4. 週報への実装(87歳からのフィードバック)"), "weekly", "章の見分け: 週報");
  eq(futureSection_("3. 経済の客観検証(速報版)"), null, "関係ない章は読み飛ばす");

  eq(JSON.stringify(limitlessKinds_("🔥トライ,🌱初めて")), JSON.stringify(["トライ", "初めて"]),
     "★種別が2つ入ったセルを両方拾う");
  eq(JSON.stringify(limitlessKinds_("🌱初めて?")), JSON.stringify(["初めて"]), "「?」付きでも拾う");
  eq(JSON.stringify(limitlessKinds_("🗣️教え")), JSON.stringify(["教え"]), "絵文字ではなく言葉で判定する");
  eq(JSON.stringify(limitlessKinds_("🤝人,🌱初めて")), JSON.stringify(["人", "初めて"]), "🤝人を拾う");
  eq(JSON.stringify(limitlessKinds_("")), JSON.stringify([]), "空セルは空");
  eq(JSON.stringify(limitlessKinds_("🌈知らない種別")), JSON.stringify([]), "知らない種別は無視する");

  const LIM = [["日付", "種別", "内容", "関連(教えは誰に)", "出所"],
               ["2026-08-11", "🔥トライ", "百クラブ構想", "Kindle", "遡り抽出v2"]];
  const hd = findColumns_(LIM, { date: ["日付", "記録日"], kind: ["種別"], text: ["内容"], who: ["関連"], src: ["出所"] }, "date");
  eq(hd.row, 0, "リミットレス台帳の見出し行を見つける");
  eq(hd.map.who, 3, "「関連(教えは誰に)」を先頭一致で拾う");

  const ECO = [["記録日", "口座/資産名", "区分", "評価額", "通貨", "出所"]];
  const eh = findColumns_(ECO, ECO_COLS, "date");
  ok(eh && eh.map.name === 1 && eh.map.amount === 3 && eh.map.currency === 4,
     "経済台帳の雛形（見出しだけ）の列を正しく拾う", JSON.stringify(eh));
})();

/* ================= 実データでの素通し確認 ================= */
console.log("\n【いまの data.json での実行】");
const real = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));
["health", "know", "spirit", "work", "priv", "eco"].forEach(r => {
  const v = ckVoice(real, r), l87 = ckLadder(real, r, 87);
  ok(v && v.text && v.text.indexOf("undefined") < 0 && v.text.indexOf("NaN") < 0 && l87,
     CK_ROOMS[r].label + "：実データでも声とはしごが出る", JSON.stringify({ v: v, l: l87 }));
  console.log("   " + CK_ROOMS[r].icon + " " + CK_ROOMS[r].label +
    "  👴" + (v.tone === "yell" ? "エール" : "アラーム") + ": " + v.text);
});

console.log(fail === 0 ? "\n全ケース合格 ✅" : "\n" + fail + "件 不一致 ❌");
process.exit(fail === 0 ? 0 : 1);
