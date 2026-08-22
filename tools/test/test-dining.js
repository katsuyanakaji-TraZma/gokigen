/**
 * v1.6 会食予実（枠・予約・実績）＋ note台帳 ＋ 月間サニティ1,800 のテスト
 *   （node tools/test/test-dining.js）
 *
 * 設計思想（2026-08-22 本人決定）：
 *   (A) 分数・スラッシュ表示を廃止し、「枠・予約・実績」等の言葉＋計算済みの数字で示す
 *       （「9/12」ではなく「あと3席」）
 *   (B) 目標 → 現状 → ギャップ → 次の一手1行 まで出す
 *
 * 確かめること：
 *   ①【GAS】カレンダーのタイトルから「空き枠／予約／数えない」と区分を見分ける
 *      判定は**実際にカレンダーに置いてあるタイトル**で行う（作り物ではなく本物の書き方）
 *   ②【アプリ】今月の予実（実績・これから・空き席・着地見込み）と、12回を超えたときの警告
 *   ③【アプリ】未来3ヶ月の予約と空き席、家族⚠️の点灯・消灯
 *   ④【アプリ】直近6ヶ月の実績バーと、次の一手1行
 *   ⑤【アプリ】分数表記が画面から消えていること（index.html を丸ごと走査）
 *   ⑥【GAS+アプリ】note台帳（列＝記録日/集計時刻/期間種別/期間/全体ビュー/コメント/スキ/備考）
 *   ⑦【GAS】Udemy月間サニティ 1,800人（1,600人では出ない・1,900人なら出る）
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
const has = (hay, needle, name) => ok(hay.indexOf(needle) >= 0, name, "「" + needle + "」が見つからない");
const hasnt = (hay, needle, name) => ok(hay.indexOf(needle) < 0, name, "「" + needle + "」がまだ残っている");

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
eval(pickGs("var LIMITLESS_FOLDER_ID", "// ===== STEP1"));
eval(pickGs("// ===== Udemy台帳（base + デルタの合算） =====", "// 今公開中の data.json"));
eval(pickGs("// ===== v1.2: base + デルタ形式の台帳を読む共通部品 =====", "// ===== v1.2: リミットレス台帳"));
eval(pickGs("var CAL_SLOT_RE", "/**\n * primaryカレンダーから"));
eval(pickGs("var NOTE_COLS", "var NOTE_KEEP"));

/* ---------- ①【GAS】カレンダーのタイトルの見分け ---------- */
console.log("\n【要件1】カレンダーのタイトルから「空き枠／予約／数えない」を見分ける");
// 本物のタイトル（2026-08-22時点で primary に置かれているもの）
const T = {
  open1:  "🎁ご褒美枠｜空き（客/師/恩/友/家族）",
  open2:  "🎁ご褒美枠｜空き（客/師/恩/友）",
  susume: "🎁ご褒美枠｜家族推奨（11月分）",
  fam9:   "🎁ご褒美枠（家族枠・確定）｜9/20 昼or夜は家族と相談",
  fam10:  "🎁ご褒美枠（家族枠・確定）｜10/10(土)",
  yobi:   "🎁ご褒美枠｜予備（家族9/20確定につき原則不使用）",
  shop1:  "「正泰苑」新橋店　ご褒美枠（友人枠）",
  shop2:  "蒼天 南口店　ご褒美枠（友人枠）",
  nasu:   "🎁ご褒美枠確定｜旅行　那須岳（家族）",
  yoyaku: "🎁ご褒美枠｜予約済：客枠（アズビル 高橋さん）",
  other:  "🏔那須岳 1泊2日（妻と・ゆるりんちょ撮影回）"
};
eq(calKind_(T.open1),  "open",   "「空き（客/師/恩/友/家族）」は空き枠");
eq(calKind_(T.open2),  "open",   "「空き（客/師/恩/友）」も空き枠");
eq(calKind_(T.susume), "open",   "★「家族推奨」はまだ空き枠（予約ではない）");
eq(calKind_(T.fam9),   "booked", "★「（家族枠・確定）」は予約");
eq(calKind_(T.yobi),   "skip",   "★「予備・原則不使用」は空きにも予約にも数えない");
eq(calKind_(T.shop1),  "booked", "★店名＋（友人枠）は予約（「予約済」と書いていなくても）");
eq(calKind_(T.nasu),   "booked", "「ご褒美枠確定」は予約");
eq(calKind_(T.yoyaku), "booked", "「予約済：◯◯枠」は予約");
eq(calKind_(T.other),  "null",   "ご褒美枠でない予定は対象外（null）");
ok(calKind_(T.yobi) === "skip" && /予備/.test(T.yobi) && /確定/.test(T.yobi),
   "★「予備」は「確定」より先に見る（順番が命）", "順番が入れ替わっている");

console.log("\n【要件1】区分（客/師/恩/友/家族）を括弧の中から拾う");
eq(calCat_(T.fam9),   "family", "（家族枠・確定）→ 家族");
eq(calCat_(T.fam10),  "family", "（家族枠・確定）→ 家族");
eq(calCat_(T.shop1),  "friend", "（友人枠）→ 友");
eq(calCat_(T.nasu),   "family", "（家族）→ 家族");
eq(calCat_(T.yoyaku), "client", "（アズビル 高橋さん）でも「客枠」から 客");
eq(calCat_(T.open1),  "null",   "★「空き（客/師/恩/友/家族）」の括弧はメニューなので区分にしない");
eq(calCat_("🎁ご褒美枠｜予約済：師枠（前田さん）"), "mentor", "師");
eq(calCat_("🎁ご褒美枠｜予約済：恩枠（お世話になった方）"), "okuri", "恩");
eq(calCat_("🎁ご褒美枠｜予約済：家族（妻と）"), "family", "★家族をいちばん先に見る");

/* ---------- ⑥【GAS】note台帳の列 ---------- */
console.log("\n【要件4】note台帳の見出し（本物の1行目）を読める");
const noteHead = ["記録日", "集計時刻", "期間種別", "期間", "全体ビュー", "コメント", "スキ", "備考"];
const noteValues = [noteHead,
  ["2026-08-21", "3:43", "月間", "2026-07-22〜2026-08-21", 7755, 50, 397, "TOP5=お盆はOSハント週間502"],
  ["2026-08-21", "3:43", "全期間", "〜2026-08-21", 74142, 430, 3385, ""],
  ["2026-08-20", "5:44", "月間", "2026-07-21〜2026-08-20", 7636, 48, 377, "参考(前日集計)"]];
const nhd = findColumns_(noteValues, NOTE_COLS, "date");
ok(!!nhd, "見出し行が見つかる", "見つからない");
eq(nhd.map.date, 0, "記録日は0列目");
eq(nhd.map.span, 2, "期間種別は2列目");
eq(nhd.map.views, 4, "全体ビューは4列目");
eq(nhd.map.likes, 6, "スキは6列目");
has(gs, "function readNote_", "readNote_ がある");
has(gs, "noteDeltaPrefix: 'note台帳ログ_'", "読むのは note台帳ログ_YYYY-MM-DD");
has(gs, "note: note,", "data.json に note を入れている");

/* ---------- ⑦【GAS】月間サニティ 1,800 ---------- */
console.log("\n【要件5】Udemyの月間サニティは1,800人（1,600では出ない・1,900なら出る）");
eq(WARN_MONTH_NEW, 1800, "★しきい値が1,800になっている");
const sanity = n => buildWarnings_({ rows: [], skipped: [] }, [], "2026-08-31",
  [{ ym: "2026-08", officialNew: n, to: "2026-08-31" }])
  .filter(w => w.kind === "monthSanity");
eq(sanity(1600).length, 0, "★1,600人では警告を出さない（正当な増加）");
eq(sanity(1799).length, 0, "1,799人でも出さない");
eq(sanity(1900).length, 1, "★1,900人なら「二重計上疑い」を出す");
has(sanity(1900)[0].text, "1800", "警告文に新しい目安（1800）が入っている");

/* ========== アプリ側（index.html） ========== */
const leak = code => code.replace(/^(const|let) /gm, "var ");
const pickHtml = (a, b) => {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0) throw new Error("index.html に目印が見つかりません: " + (i < 0 ? a : b));
  return html.slice(i, j);
};
eval(leak(pickHtml("/* ===== util ===== */", "/* ===== state ===== */")));
eval(leak(pickHtml("/* ===== v1.6 会食予実（枠・予約・実績）ここから =====",
                   "/* ===== v1.6 会食予実 ここまで ===== */")));

/* 作り物の data.json。今日＝2026-09-05 として数える（9月のまん中） */
const TODAY = "2026-09-05";
const ev = (date, kind, cat, title) => ({ date, ym: date.slice(0, 7), kind, cat, title });
const D1 = {
  calendar: { asOf: TODAY, monthCap: 12, events: [
    // 9月：予約2件（うち1件は過ぎた日）＋空き4件（うち1件は過ぎた日）
    ev("2026-09-03", "booked", "friend", "🎁ご褒美枠｜予約済：友枠（田中さん）"),
    ev("2026-09-04", "open",   null,     "🎁ご褒美枠｜空き（客/師/恩/友/家族）"),
    ev("2026-09-11", "open",   null,     "🎁ご褒美枠｜空き（客/師/恩/友/家族）"),
    ev("2026-09-20", "booked", "family", "🎁ご褒美枠（家族枠・確定）｜9/20 昼or夜は家族と相談"),
    ev("2026-09-22", "open",   null,     "🎁ご褒美枠｜空き（客/師/恩/友/家族）"),
    ev("2026-09-30", "open",   null,     "🎁ご褒美枠｜空き（客/師/恩/友/家族）"),
    // 10月：家族の予約あり
    ev("2026-10-06", "open",   null,     "🎁ご褒美枠｜空き（客/師/恩/友/家族）"),
    ev("2026-10-10", "booked", "family", "🎁ご褒美枠（家族枠・確定）｜10/10(土)"),
    // 11月：家族の予約なし（「家族推奨」はまだ空き枠）
    ev("2026-11-05", "open",   null,     "🎁ご褒美枠｜空き（客/師/恩/友/家族）"),
    ev("2026-11-20", "open",   null,     "🎁ご褒美枠｜家族推奨（11月分）"),
    ev("2026-11-12", "booked", "client", "🎁ご褒美枠｜予約済：客枠（アズビル）"),
    // 12月：まっさら
    ev("2026-12-24", "open",   null,     "🎁ご褒美枠｜家族推奨（12月分・クリスマスイブ）")
  ] },
  health: [
    { date: "2026-07-10", dining: "客・アズビル懇親" },
    { date: "2026-07-20", dining: "家族で焼肉" },
    { date: "2026-08-14", dining: "家族・那須岳" },
    { date: "2026-08-20", dining: "友人枠・正泰苑" },
    { date: "2026-08-21", dining: "友人枠・蒼天" },
    { date: "2026-09-01", dining: "客・三井化学の懇親会" },
    { date: "2026-09-02", dining: "なし" },
    { date: "2026-09-03", dining: "友人と一杯" }
  ]
};

console.log("\n【要件2】今月の予実（今日＝" + TODAY + "）");
const m1 = dnThisMonth(D1, TODAY);
eq(m1.done, 2, "★実績は台帳から2回（9/1と9/3。「なし」は数えない）");
eq(m1.upcoming.length, 1, "★これからの予約は1回（9/20だけ。9/3は実績と同じ日なので二重に数えない）");
eq(m1.open.length, 3, "★空き枠は今日以降の3日（9/4は過ぎたので数えない）");
eq(m1.forecast, 3, "着地見込み ＝ 実績2 ＋ これから1 ＝ 3回");
eq(m1.remain, 9, "枠12回の残りは9回");
eq(m1.seats, 3, "★まだ入れられる席は3（空き枠3と枠の残り9の、少ないほう）");
eq(m1.over, false, "12回を超えていないので警告は出ない");
eq(m1.cap, 12, "枠はカレンダー側の決め（12）を使う");
eq(m1.byCat.family.done + m1.byCat.family.booked, 1, "家族は予約1件（9/20）");
eq(m1.byCat.client.done, 1, "客の実績1回（三井化学）");

console.log("\n【要件2】着地見込みが枠を超えたとき");
const many = { calendar: { monthCap: 12, events: [] }, health: [] };
for (let d = 1; d <= 9; d++) many.health.push({ date: "2026-09-0" + d, dining: "客と会食" });
for (let d = 10; d <= 14; d++) many.calendar.events.push(ev("2026-09-" + d, "booked", "client", "予約済：客枠 ご褒美枠"));
const m2 = dnThisMonth(many, TODAY);
eq(m2.done, 9, "実績9回");
eq(m2.upcoming.length, 5, "これから5回");
eq(m2.forecast, 14, "着地見込み14回");
eq(m2.over, true, "★12回を超えたので赤字警告");
eq(m2.overBy, 2, "★2回オーバー");
eq(m2.seats, 0, "★枠を使いきっているので、まだ入れられる席は0");
has(dnNextMove(many, TODAY), "2回", "★次の一手が「2件を来月に回す」と言っている");

console.log("\n【要件2】カレンダーがつながっていないとき");
const noCal = { health: D1.health };
eq(dnThisMonth(noCal, TODAY).hasCal, false, "カレンダー未接続を見分ける");
eq(dnThisMonth(noCal, TODAY).done, 2, "★実績（台帳）だけは今までどおり出る");
has(dnNextMove(noCal, TODAY), "calendar.readonly", "★次の一手が「再承認してください」と言う");

console.log("\n【要件2】未来3ヶ月の予約と空き席・家族⚠️");
const fut = dnFutureMonths(D1, TODAY, 3);
eq(fut.length, 3, "来月から3ヶ月ぶん");
eq(fut[0].ym, "2026-10", "1つめは10月");
eq(fut[0].booked.length, 1, "10月の予約は1回");
eq(fut[0].seats, 1, "10月のあと1席");
eq(fut[0].famWarn, false, "★10月は家族が確定しているので⚠️は消灯");
eq(fut[1].ym, "2026-11", "2つめは11月");
eq(fut[1].booked.length, 1, "11月の予約は1回（客）");
eq(fut[1].seats, 2, "11月のあと2席（空き2・枠の残り11の少ないほう）");
eq(fut[1].famWarn, true, "★11月は家族の予約がゼロなので⚠️家族まだが点灯");
eq(fut[2].famWarn, true, "★12月も家族はまだ（家族推奨はあくまで空き枠）");
has(dnNextMove(D1, TODAY), "11月", "★次の一手が、いちばん近い「家族まだ」の月を指す");
has(dnNextMove(D1, TODAY), "11月5日(木)", "★その月の空き枠の日にちまで出す");

// 家族の予約が入ったら⚠️が消えることを確かめる（点灯・消灯の両方）
const D2 = JSON.parse(JSON.stringify(D1));
D2.calendar.events.push(ev("2026-11-20", "booked", "family", "🎁ご褒美枠｜予約済：家族（妻と）"));
eq(dnFutureMonths(D2, TODAY, 3)[1].famWarn, false, "★11月に家族の予約を入れたら⚠️が消える");

console.log("\n【要件2】直近6ヶ月の実績バー");
const past = dnPastMonths(D1, TODAY, 6);
eq(past.length, 6, "6ヶ月ぶん");
eq(past[past.length - 1].ym, "2026-08", "★いちばん右は先月（今月は上のカードで見るので入れない）");
eq(past[past.length - 1].total, 3, "8月は3回");
eq(past[past.length - 1].counts.family, 1, "8月の家族は1回");
eq(past[past.length - 1].counts.friend, 2, "8月の友は2回");
eq(past[past.length - 2].total, 2, "7月は2回");

console.log("\n【要件2】月またぎの計算（12月→1月で年をまたぐ）");
eq(dnYmAdd("2026-12", 1), "2027-01", "★12月の次は翌年1月");
eq(dnYmAdd("2026-01", -1), "2025-12", "1月の前は前年12月");
eq(dnYmLabel("2027-01"), "2027年1月", "月のラベル");
eq(dnDate("2026-09-20"), "9月20日(日)", "★日付はスラッシュを使わず曜日つきで出す");

console.log("\n【要件4】noteカードの中身");
const nD = { note: { asOf: "2026-08-21", time: "3:43",
  month: { period: "2026-07-22〜2026-08-21", views: 7755, comments: 50, likes: 397, note: "TOP5=…" },
  all:   { period: "〜2026-08-21", views: 74142, comments: 430, likes: 3385 } } };
const nn = dnNote(nD);
eq(nn.ok, true, "note台帳が読めている");
eq(nn.month.views, 7755, "★月間ビュー 7,755");
eq(nn.month.likes, 397, "★月間スキ 397");
eq(nn.all.views, 74142, "★全期間ビュー 74,142");
eq(nn.asOf, "2026-08-21", "最新の記録日を採用");
eq(dnNote({}).ok, false, "台帳がまだ無ければ ok:false（画面は「データ待ち」）");
eq(dnNote({ note: { rows: [] } }).ok, false, "空の器でも落ちない");

/* ---------- ⑤ 分数表記が消えているか（index.html を丸ごと走査） ---------- */
console.log("\n【要件3】分数・スラッシュ表示が画面から消えている");
hasnt(html, "+'/10'", "ご機嫌度の「/10」が消えている");
hasnt(html, "'/10（'", "3点セットの「/10（」が消えている");
hasnt(html, "' / '+(bp.bpLow", "血圧の「128 / 82」が消えている");
hasnt(html, "r.bpHigh+' / '", "3点セットの血圧の「/」が消えている");
hasnt(html, "' / 100コース'", "「12 / 100コース」が消えている");
hasnt(html, "' / '+c.max", "会食の「2 / 4日」が消えている");
hasnt(html, "famUsed+'/4日'", "家族枠の「1/4日」が消えている");
hasnt(html, "ご機嫌度:    /10", "点呼テンプレの「/10」が消えている");
hasnt(html, "const KCATS", "古い分数グリッド（KCATS）は削除ずみ");
hasnt(html, 'id="kgrid"', "古い分数グリッドのDOMも消えている");
has(html, "'上'+bp.bpHigh+'・下'", "血圧が「上128・下82」になっている");
has(html, "'あと'+(100-n)+'本（公開ずみ '", "Udemyが「あと88本」になっている");
has(html, "m.cur.mood+'点'", "ご機嫌度が「6点」になっている");
has(html, "点（満点10点）", "満点が言葉で書いてある");
/* 画面に出す文字列の中に「数字／数字」が残っていないかを1行ずつ見る。
   日付そのもの（2030/4/29 など）とURL・ISO日時は分数ではないので通す。 */
const FRAC_OK = ["2030/4/29", "2026/8月", "T00:00:00", "://"];
const jsBody = html.slice(html.indexOf("<script>"), html.lastIndexOf("</script>"));
const frac = [];
jsBody.split("\n").forEach((ln, i) => {
  (ln.match(/'[^'\n]*'/g) || []).concat(ln.match(/`[^`\n]*`/g) || []).forEach(x => {
    if (!/\d\s*\/\s*\d/.test(x)) return;
    if (FRAC_OK.some(w => x.indexOf(w) >= 0)) return;
    frac.push((i + 1) + "行目 " + x);
  });
});
ok(frac.length === 0, "★JSの文字列に「数字／数字」の分数が残っていない", "残り:\n     " + frac.join("\n     "));

console.log("\n【画面の配線】");
has(html, 'id="dnNow"', "今月の会食カードがある");
has(html, 'id="dnFuture"', "これから3ヶ月のストリップがある");
has(html, 'id="dnPast"', "直近6ヶ月の実績バーがある");
has(html, 'id="noteCard"', "仕事タブに note カードがある");
has(html, "  renderNote();", "renderWork から renderNote を呼んでいる");
const iWork = html.indexOf('id="pg-work"'), iNote = html.indexOf('id="noteCard"'), iEco = html.indexOf('id="pg-eco"');
ok(iWork < iNote && iNote < iEco, "★noteカードは仕事タブの中にある", iWork + "/" + iNote + "/" + iEco);
has(html, "着地見込み", "「着地見込み」という言葉が画面にある");
has(html, "まだ入れられる席", "「まだ入れられる席」という言葉が画面にある");
has(html, "⚠️ 家族まだ", "「⚠️家族まだ」が画面にある");

/* ---------- 実データを素通し ---------- */
console.log("\n【実データ】いま公開中の data.json を素通しして落ちないか");
const real = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));
const rm2 = dnThisMonth(real), rf = dnFutureMonths(real), rp = dnPastMonths(real), rn = dnNote(real);
console.log("   形式 v" + real.version + " ／ 今月: 実績" + rm2.done + "回・これから" +
            rm2.upcoming.length + "回・あと" + rm2.seats + "席・着地見込み" + rm2.forecast + "回" +
            (rm2.hasCal ? "" : "（カレンダー未接続）"));
console.log("   未来: " + rf.map(f => f.label + " 予約" + f.booked.length + "・あと" + f.seats + "席" +
            (f.famWarn ? "・⚠️家族まだ" : "")).join(" ／ "));
console.log("   過去: " + rp.map(x => x.label + " " + x.total + "回").join(" ／ "));
console.log("   note: " + (rn.ok ? rn.asOf + " 月間" + rn.month.views + "ビュー" : rn.reason));
console.log("   次の一手: " + dnNextMove(real));
ok(!!rm2 && !!rf && !!rp && !!rn, "実データでも形がそろっている");

console.log(fail ? "\n❌ " + fail + "件 失敗\n" : "\n全ケース合格 ✅\n");
process.exit(fail ? 1 : 0);
