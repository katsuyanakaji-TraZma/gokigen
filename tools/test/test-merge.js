const fs = require("fs");
const src = fs.readFileSync("__dirname + "/../update-data.gs"", "utf8");
const pick = (a, b) => src.slice(src.indexOf(a), b ? src.indexOf(b) : undefined);
eval(pick("var HEALTH_FIELDS", "// ===== Udemy台帳"));
eval(pick("// ===== 変換ヘルパー =====", "// ===== GitHub ====="));

const parse = row => ({
  date: toDate_(row[0]), dow: row[1], weight: num_(row[2]), fat: num_(row[3]),
  muscle: num_(row[4]), visceral: num_(row[5]), bodyAge: num_(row[6]),
  bpHigh: num_(row[7]), bpLow: num_(row[8]), mood: mood_(row[9]), sleep: num_(row[10]),
  exercise: str_(row[11]), dining: str_(row[12]), routine: num_(row[13]), note: str_(row[14]),
  _ok: wellFormed_(row)
});

const N = null;
let moodFail = 0;
const cases = [
  { n: "7/12 機嫌6は正当な記録・列ズレではない",
    old: ["2026-07-12", "日", 84.1, 30.6, 55.4, 11, 61, "", "", 6, 83, "", "尾崎くん新築祝い(友枠)", "", "睡眠不足の自覚あり。"],
    neu: ["2026-07-12", "日", 84.1, 30.6, 55.4, 11, 61, 6, 83, "尾崎くん新築祝い(友枠)", "睡眠不足の自覚あり。", "", "", "", ""],
    want: { mood: 6, sleep: 83, bpHigh: N, bpLow: N, dining: "尾崎くん新築祝い(友枠)" } },

  { n: "7/17 血圧は正しいが機嫌/睡眠がズレ",
    old: ["2026-07-17", "金", 83.7, 30.5, 55.3, 10, 61, 114, 76, "", 87, "", "", "", "睡眠87…"],
    neu: ["2026-07-17", "金", 83.7, 30.5, 55.3, 10, 61, 114, 76, 87, "睡眠87…", "", "", "", ""],
    want: { bpHigh: 114, bpLow: 76, mood: N, sleep: 87 } },

  { n: "7/20 血圧有効・睡眠欄に運動テキスト",
    old: ["2026-07-20", "月", 82.1, 29.9, 54.7, 10, 60, 132, 88, "", 62, "ウォーク7.50km", "", "", "睡眠62…"],
    neu: ["2026-07-20", "月", 82.1, 29.9, 54.7, 10, 60, 132, 88, 62, "ウォーク7.50km", "睡眠62…", "", "", ""],
    want: { bpHigh: 132, bpLow: 88, sleep: 62, exercise: "ウォーク7.50km" } },

  { n: "7/23 血圧下に長文",
    old: ["2026-07-23", "木", 82.4, 30, 54.8, 10, 60, "", "", "", 86, "", "", "", "睡眠86…"],
    neu: ["2026-07-23", "木", 82.4, 30, 54.8, 10, 60, 86, "睡眠86…", "", "", "", "", "", ""],
    want: { bpHigh: N, sleep: 86 } },

  { n: "7/14 体重欄に4/5",
    old: ["2026-07-14", "火", "", "", "", "", "", "", "", "4/5", 81, "", "なし", 12.5, "三井化学…"],
    neu: ["2026-07-14", "火", "4/5", 81, "なし", 12.5, "三井化学…", "", "", "", "", "", "", "", ""],
    want: { weight: N, fat: N, mood: 8, sleep: 81, routine: 12.5 } },

  { n: "8/03 Sheetsが4/5を日付に変換",
    old: null,
    neu: ["2026-08-03", "月", 82.7, 30.1, 54.9, 10, 61, "", "", new Date(2026, 3, 5), 88, "", "", "", "睡眠88…"],
    want: { mood: 8, sleep: 88 } },

  { n: "8/11 正常な最新行",
    old: null,
    neu: ["2026-08-11", "火", 83, 30.2, 55, 10, 61, "", "", "", 90, "", "", "", "睡眠90…"],
    want: { weight: 83, sleep: 90, mood: N } },

  { n: "新しい行が正しければ古い値を上書きする",
    old: ["2026-08-10", "月", 82.0, 29.8, 54.7, 10, 60, "", "", "", 67, "", "", "", "旧メモ"],
    neu: ["2026-08-10", "月", 82.5, 29.9, 54.8, 10, 60, "", "", "", 70, "", "", "", "新メモ"],
    want: { weight: 82.5, sleep: 70, note: "新メモ" } },
];


console.log("[ご機嫌度の10段階換算]");
[["4/5", 8], ["3/5(真ん中)", 6], [4, 8], [6, 6], [10, 10], ["かなりよい", 10], ["8/10", 8], [87, null], ["", null]]
  .forEach(([inp, exp]) => {
    const got = mood_(inp);
    console.log((String(got) === String(exp) ? "  ✅ " : "  ❌ ") + JSON.stringify(inp) + " → " + got +
      (String(got) === String(exp) ? "" : "  期待:" + exp));
    if (String(got) !== String(exp)) moodFail++;
  });
console.log("");
let fail = 0;
cases.forEach(c => {
  let acc = null;
  if (c.old) acc = mergeRow_(acc, parse(c.old));
  acc = mergeRow_(acc, parse(c.neu));
  const bad = Object.entries(c.want).filter(([k, v]) => String(acc[k]) !== String(v));
  console.log((bad.length ? "❌" : "✅") + " " + c.n);
  bad.forEach(([k, v]) => { console.log("     " + k + ": 結果=" + acc[k] + "  期待=" + v); fail++; });
});
console.log(fail === 0 ? "\n全ケース合格 ✅" : "\n" + fail + "件 不一致 ❌");
process.exit(fail === 0 && moodFail === 0 ? 0 : 1);
