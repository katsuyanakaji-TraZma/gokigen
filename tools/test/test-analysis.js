/**
 * 分析メモ4視点のテスト（node tools/test/test-analysis.js）
 *
 * index.html の「分析メモ（4視点）ここから 〜 ここまで」だけを切り出して動かす。
 * data.json は毎日中身が変わるので、判定は固定の作り物データで行い、
 * 実データは「落ちずに4視点そろうか」の素通し確認だけにしている。
 *
 * 確かめること：
 *   ① 健全性 … 逆行・欠損・空欄・停止・異常な跳ね・評価の急変を拾い、出たら必ず最優先になるか
 *   ② ギャップ … 評価が低いのに稼ぐ講座／評価が高いのに登録が少ない講座を名指しできるか
 *   ③ 新作 … 公開後おなじ月齢の過去作と比べられるか（未来の月や公開前の月を混ぜないか）
 *   ④ 変化点 … いちばん動いた講座と、台帳の一言から拾う施策名（優先順位と日付の範囲）
 */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "..");
const src = fs.readFileSync(path.join(root, "index.html"), "utf8");

// index.html から必要な範囲だけ取り出す。const / let のままだと eval の外に出ないので var にする。
const pick = (a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b);
  if (i < 0 || j < 0) throw new Error("index.html に目印が見つかりません: " + (i < 0 ? a : b));
  return src.slice(i, j);
};
const leak = code => code.replace(/^(const|let) /gm, "var ");

eval(leak(pick("/* ===== util ===== */", "/* ===== Udemy 集計 ===== */")));
eval(leak(pick("/* ===== 分析メモ（4視点）ここから =====", "/* ===== 分析メモ ここまで ===== */")));

let fail = 0;
const ok = (cond, name, detail) => {
  console.log((cond ? "✅ " : "❌ ") + name + (cond ? "" : "\n     " + detail));
  if (!cond) fail++;
};
const eq = (got, want, name) => ok(String(got) === String(want), name, "結果=" + got + "  期待=" + want);
const has = (text, word, name) => ok(String(text).indexOf(word) >= 0, name, "この語が無い: " + word + "\n     本文: " + text);

/* ================= 作り物データ ================= */
// N01 = 新作（公開3ヶ月目）。P01〜P05 = 公開12ヶ月以上の既存作。
const COURSES = [
  { id: "N01", short: "新作",         published: "2026/6" },
  { id: "P01", short: "高評価低ペース", published: "2024/6" },
  { id: "P02", short: "低評価稼ぎ頭",   published: "2023/6" },
  { id: "P03", short: "ふつう",        published: "2023/1" },
  { id: "P04", short: "人気",          published: "2022/6" },
  { id: "P05", short: "古参",          published: "2021/6" }
];
// 累計登録（4つの記録日ぶん）／累計収益／評価
const ENROLL = {
  N01: [285, 290, 295, 300],
  P01: [2694, 2696, 2698, 2700],
  P02: [7984, 7988, 7990, 8000],
  P03: [8790, 8794, 8797, 8800],
  P04: [15288, 15292, 15296, 15300],
  P05: [12594, 12597, 12599, 12600]
};
const REV    = { N01: 200, P01: 2700, P02: 39000, P03: 8800, P04: 15300, P05: 12600 };
const RATING = { N01: 4.70, P01: 4.50, P02: 3.80, P03: 4.10, P04: 4.20, P05: 4.00 };
const DATES  = ["2026-08-09", "2026-08-11", "2026-08-12", "2026-08-13"];

// 月次。新作N01と、各既存作の「公開後0ヶ月目・1ヶ月目・2ヶ月目」だけ埋めれば③は判定できる
const MONTHLY_AT = {
  "2026-06": { N01: 0 }, "2026-07": { N01: 120 }, "2026-08": { N01: 300 },
  "2024-06": { P01: 200 }, "2024-07": { P01: 500 }, "2024-08": { P01: 1000 },
  "2023-06": { P02: 250 }, "2023-07": { P02: 600 }, "2023-08": { P02: 1200 },
  "2023-01": { P03: 300 }, "2023-02": { P03: 700 }, "2023-03": { P03: 1400 },
  "2022-06": { P04: 150 }, "2022-07": { P04: 400 }, "2022-08": { P04: 900 },
  "2021-06": { P05: 350 }, "2021-07": { P05: 800 }, "2021-08": { P05: 1600 }
};
const NOTES = [
  { date: "2026-08-01", note: "感謝祭の準備メモ（この日は集計の対象外）" },
  { date: "2026-08-06", note: "C02の刷新を進めた" },
  { date: "2026-08-10", note: "Udemy感謝祭がはじまった" },
  { date: "2026-08-11", note: "感謝祭2日目" },
  { date: "2026-08-13", note: "C08刷新に着手。ビジョンメイキング90分" }
];

function fixture() {
  return {
    generatedAt: "2026-08-13T08:30:00+09:00",
    qualityDropped: [],
    udemyCourses: COURSES.map(c => Object.assign({}, c)),
    health: NOTES.map(n => ({ date: n.date, dow: "-", note: n.note })),
    udemy: DATES.map((d, i) => ({
      date: d, time: "8:00",
      rows: COURSES.map(c => ({ id: c.id, cumEnroll: ENROLL[c.id][i], cumRevenue: REV[c.id], rating: RATING[c.id] }))
    })),
    udemyMonthly: Object.keys(MONTHLY_AT).sort().map(ym => ({
      ym: ym, enroll: null, newEnroll: null, revenue: null,
      byCourse: Object.keys(MONTHLY_AT[ym]).reduce((o, id) => {
        o[id] = { enroll: MONTHLY_AT[ym][id], revenue: null }; return o;
      }, {})
    }))
  };
}
const clone = d => JSON.parse(JSON.stringify(d));
const latest = d => d.udemy[d.udemy.length - 1];
const rowOf = (d, id) => latest(d).rows.find(r => r.id === id);

/* ================= ① データ健全性 ================= */
console.log("\n【① データ健全性】");
const clean = anaHealth(fixture());
eq(clean.warn, false, "異常が無ければ warn は false");
eq(clean.score, 5, "異常が無ければ score は低い（他の視点に譲る）");
has(clean.lines[0], "欠損・逆行・異常な跳ねはありません", "異常が無いときの文面");
has(clean.lines[0], "累計47,700人", "累計人数を出す（6コースの合計）");

const back = fixture(); rowOf(back, "P02").cumEnroll = 7000;      // 前回7,990人から逆行
const backR = anaHealth(back);
eq(backR.warn, true, "逆行: warn になる");
ok(backR.score > 100, "逆行: score が100超（必ず最優先）", "score=" + backR.score);
has(backR.detail.join(" / "), "取り違え", "逆行: コースIDの取り違えを疑うよう促す");
eq(computeUdemyAnalysis(back)[0].key, "health", "★ 異常がある日は、健全性が先頭にくる");

const miss = fixture(); latest(miss).rows = latest(miss).rows.filter(r => r.id !== "P03");
has(anaHealth(miss).detail.join(" / "), "P03 ふつうの記録がありません", "欠損: 記録の無いコースを名指しする");

const blank = fixture(); rowOf(blank, "P03").cumEnroll = null;
has(anaHealth(blank).detail.join(" / "), "累計登録が空欄です", "空欄: 数字が入っていないコースを拾う");

const stale = fixture(); stale.generatedAt = "2026-08-17T08:30:00+09:00";
has(anaHealth(stale).detail.join(" / "), "Udemy台帳が4日更新されていません", "停止: 台帳が止まっていたら警告");

const spike = fixture(); rowOf(spike, "P02").cumEnroll = 8050;    // 普段2人/日 → 60人/日
has(anaHealth(spike).detail.join(" / "), "普段の約30倍", "跳ね: 普段の5倍を超える増分を検知");
const small = fixture(); rowOf(small, "P01").cumEnroll = 2718;    // 2人/日 → 20人/日 だが20人しか増えていない
ok(anaHealth(small).warn === false, "跳ね: 増分が30人未満なら騒がない（少人数のブレ）", "warn=" + anaHealth(small).warn);

const rate = fixture(); rowOf(rate, "P04").rating = 3.85;         // 4.20 から 0.35 動いた
has(anaHealth(rate).detail.join(" / "), "評価が4.2→3.85と大きく動いています", "評価: 0.3以上動いたら警告");
const rateSmall = fixture(); rowOf(rateSmall, "P04").rating = 4.05;
ok(anaHealth(rateSmall).warn === false, "評価: 0.3未満の動きは通常の変動として流す", "warn=true になった");

const dropped = fixture(); dropped.qualityDropped = [{ date: "2026-08-12", field: "weight", value: 999 }];
has(anaHealth(dropped).detail.join(" / "), "範囲外の値を1件", "健康台帳の門番が外した値も健全性として伝える");

/* ================= ② 評価×収益のギャップ ================= */
console.log("\n【② 評価×収益のギャップ】");
const gap = anaGap(fixture());
has(gap.lines[0], "改善優先：P02 低評価稼ぎ頭", "★ 評価が低いのに稼いでいる講座を名指しする");
has(gap.lines[0], "評価3.80", "改善優先: 評価を出す");
has(gap.lines[0], "$1,000", "改善優先: 月あたり収益を出す（39,000ドル ÷ 39ヶ月）");
has(gap.lines[1], "告知不足：P01 高評価低ペース", "★ 評価が高いのに登録が少ない講座を名指しする");
has(gap.lines[1], "100人", "告知不足: 月あたり登録を出す（2,700人 ÷ 27ヶ月）");
has(gap.detail.join(" / "), "公開12ヶ月以上の5コース", "新作N01は土俵が違うので対象から外す");
ok(gap.lines.join("").indexOf("N01") < 0, "新作N01は名指しの候補にしない", gap.lines.join(""));

const noGap = fixture();                                   // 全コース同じ評価ならギャップは無い
noGap.udemy.forEach(s => s.rows.forEach(r => r.rating = 4.1));
eq(anaGap(noGap), null, "評価に差が無ければ、この視点は出さない");

/* ================= ③ 新作の立ち上がり ================= */
console.log("\n【③ 新作の立ち上がり】");
const lau = anaLaunch(fixture());
has(lau.lines[0], "N01 新作は公開3ヶ月目", "★ いちばん新しい講座を、公開からの月齢で見る");
has(lau.lines[0], "累計300人", "新作の現在値");
has(lau.lines[0], "過去5作の同じ月齢の中央値1,200人", "★ 過去作の同月齢（3ヶ月目）と比べる");
has(lau.lines[0], "25%", "中央値に対する割合");
has(lau.lines[0], "8/13時点で途中", "当月は途中である旨をことわる");
has(lau.detail.join(" / "), "P05 古参の1,600人", "同月齢でいちばん伸びた講座も出す");
has(lau.detail.join(" / "), "2ヶ月目（まるまる1ヶ月）では 120人 対 中央値600人＝20%", "ひとつ前の満了月でも比べる");

const old = fixture();                                     // 新作が公開から1年半を過ぎたら「新作」ではない
old.udemyCourses[0].published = "2024/1";
eq(anaLaunch(old), null, "公開18ヶ月を過ぎたら、この視点は出さない");

/* ================= ④ 前回からの変化点 ================= */
console.log("\n【④ 前回からの変化点】");
const mv = anaMove(fixture());
has(mv.lines[0], "8/12→8/13の1日で+25人", "★ 前回の記録日からの増分を出す");
has(mv.lines[0], "いちばん動いたのはP02 低評価稼ぎ頭の+10人", "★ 最も動いた講座と増分を名指しする");
has(mv.lines[0], "全体の40%", "全体に占める割合");
has(mv.lines[0], "直近の施策は台帳8/10の「感謝祭」です", "★ 施策名を台帳の一言から日付一致で拾う");
ok(mv.lines[0].indexOf("刷新") < 0, "施策: 8/13の「刷新」より優先順位の高い「感謝祭」を採る", mv.lines[0]);
has(mv.detail.join(" / "), "P02 低評価稼ぎ頭 +10人", "詳細では動いた順に上位5件を並べる");

const noAct = fixture();                                   // 対象期間（8/5〜8/13）の外にしか記載が無い
noAct.health = [{ date: "2026-08-01", dow: "-", note: "感謝祭の準備メモ" }];
has(anaMove(noAct).lines[0], "台帳の一言に施策の記載はありません", "施策: 期間外の記載は拾わない");

const onlyNew = fixture();                                 // 期間内に「刷新」しか無ければ、それを施策名にする
onlyNew.health = [{ date: "2026-08-12", dow: "-", note: "C08を刷新した" }];
has(anaMove(onlyNew).lines[0], "「講座の刷新」", "施策: 感謝祭が無ければ次点の施策名を拾う");

const oneSnap = fixture(); oneSnap.udemy = [latest(oneSnap)];
eq(anaMove(oneSnap), null, "記録が1回しか無ければ、変化点は出さない");

/* ================= 優先順位と全体 ================= */
console.log("\n【優先順位】");
const all = computeUdemyAnalysis(fixture());
eq(all.length, 4, "4つの視点がそろう");
ok(all.every((x, i) => i === 0 || all[i - 1].score >= x.score), "scoreの高い順に並ぶ", JSON.stringify(all.map(x => x.name + ":" + x.score.toFixed(1))));
eq(all[0].key, "launch", "異常が無い日は、いちばん情報量の多い視点（この作り物では新作）が先頭");
ok(all.every(x => x.lines.length >= 1 && x.lines.length <= 3), "どの視点も表示は1〜3行", JSON.stringify(all.map(x => x.lines.length)));
console.log("   （この作り物データの並び）");
all.forEach((x, i) => console.log("     " + (i + 1) + ". [" + x.score.toFixed(1) + "] " + x.name));

eq(computeUdemyAnalysis({ udemy: [] }).length, 0, "データが無ければ空を返す（画面は「まだ判断できません」）");

/* ================= 実データでの素通し確認 ================= */
console.log("\n【いまの data.json での実行】");
const real = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));
const realOut = computeUdemyAnalysis(real);
ok(realOut.length >= 3, "実データで3視点以上そろう", "件数=" + realOut.length);
ok(realOut.every(x => x.lines.every(t => t && t.length > 5 && t.indexOf("undefined") < 0 && t.indexOf("NaN") < 0)),
   "実データの文面に undefined / NaN が出ない", JSON.stringify(realOut.map(x => x.lines)));
realOut.forEach((x, i) => {
  console.log("   " + (i === 0 ? "★" : " ") + " [" + x.score.toFixed(1) + "] " + x.name);
  x.lines.forEach(t => console.log("       " + t));
});

console.log(fail === 0 ? "\n全ケース合格 ✅" : "\n" + fail + "件 不一致 ❌");
process.exit(fail === 0 ? 0 : 1);
