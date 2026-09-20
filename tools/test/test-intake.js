/**
 * GOKIGEN OS v2 —— 取込の門番のテスト（node tools/test/test-intake.js）
 *
 * 設計書「GOKIGEN OS v2 設計書」第4章 STEP5 の7本を、書いてある順のまま確かめる。
 *   ① 正常JSON      → ✅通知・base1行追加・アプリ反映
 *   ② Googleドキュメントを取込箱に置く → ❌通知・エラー箱
 *   ③ udemy 11要素   → ❌
 *   ④ economy「合計」行 → ❌
 *   ⑤ weight 830     → ❌（レンジ）
 *   ⑥ 取込箱に残置ファイル → アプリ⚠️
 *   ⑦ 同日2回投入     → 新しい方が正本
 *
 * 判定は「本物の schema/*.json」と「本物の tools/intake-v2.gs」で行う。
 * Google側（Drive・スプレッドシート・Slack）だけを、この中の作り物に差し替えて動かす。
 * 実際のDriveで動くかどうかは、貼り付け後に runIntakeNow() を1回押して確かめる。
 */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "..");
const gs   = fs.readFileSync(path.join(root, "tools", "update-data.gs"), "utf8");
const iv   = fs.readFileSync(path.join(root, "tools", "intake-v2.gs"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

let fail = 0;
const ok = (cond, name, detail) => {
  console.log((cond ? "✅ " : "❌ ") + name + (cond ? "" : "\n     " + detail));
  if (!cond) fail++;
};
const eq  = (got, want, name) => ok(String(got) === String(want), name, "結果=" + got + "  期待=" + want);
const has = (hay, needle, name) =>
  ok(String(hay).indexOf(needle) >= 0, name, "「" + needle + "」が無い：" + String(hay).slice(0, 200));

const pick = (src, a, b) => {
  const i = src.indexOf(a), j = b ? src.indexOf(b) : src.length;
  if (i < 0 || j < 0) throw new Error("目印が見つかりません: " + (i < 0 ? a : b));
  return src.slice(i, j);
};

/* ==========================================================================
   作り物のGoogle環境（Drive・スプレッドシート・Slack・プロパティ）
   ========================================================================== */
const DB = { nodes: {}, seq: 0 };
const nid = () => "x" + (++DB.seq);
function node(o, forceId) {
  o.id = forceId || nid();
  o.trashed = false;
  o.updated = new Date(2026, 8, 20, 12, 0, Math.min(59, DB.seq));
  DB.nodes[o.id] = o;
  return o;
}
const kids = pid => Object.keys(DB.nodes).map(k => DB.nodes[k]).filter(n => n.parent === pid && !n.trashed);
const It = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };

const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const MimeType = { GOOGLE_SHEETS: SHEET_MIME, PLAIN_TEXT: "text/plain" };

function FileW(n) {
  return {
    getId: () => n.id, getName: () => n.name, getMimeType: () => n.mime,
    getBlob: () => ({ getDataAsString: () => n.text }),
    isTrashed: () => n.trashed, setTrashed: b => { n.trashed = (b !== false); },
    getLastUpdated: () => n.updated, getUrl: () => "https://drive.test/" + n.id,
    moveTo: fw => { n.parent = fw.getId(); },
    makeCopy: (name, fw) => FileW(node({
      name: name, mime: n.mime, text: n.text, parent: fw.getId(),
      grid: n.grid ? JSON.parse(JSON.stringify(n.grid)) : null
    })),
    _n: n
  };
}
function FolderW(n) {
  return {
    getId: () => n.id, getName: () => n.name,
    isTrashed: () => n.trashed, setTrashed: b => { n.trashed = (b !== false); },
    getFoldersByName: name => It(kids(n.id).filter(c => c.folder && c.name === name).map(FolderW)),
    createFolder: name => FolderW(node({ name: name, folder: true, parent: n.id })),
    getFiles: () => It(kids(n.id).filter(c => !c.folder).map(FileW)),
    getFilesByName: name => It(kids(n.id).filter(c => !c.folder && c.name === name).map(FileW)),
    createFile: (name, content, mime) =>
      FileW(node({ name: name, mime: mime || "text/plain", text: content, parent: n.id })),
    _n: n
  };
}
function SheetW(n) {
  const g = n.grid;
  const lastRow = () => { let r = 0; g.forEach((row, i) => { if (row.some(c => c !== "" && c != null)) r = i + 1; }); return r; };
  const lastCol = () => { let c = 0; g.forEach(row => row.forEach((v, j) => { if (v !== "" && v != null) c = Math.max(c, j + 1); })); return c; };
  const ensure = (r, c) => {
    while (g.length < r) g.push([]);
    const w = Math.max(c, ...g.map(x => x.length));
    g.forEach(row => { while (row.length < w) row.push(""); });
  };
  const read = (r, c, nr, nc) => {
    const out = [];
    for (let i = 0; i < nr; i++) {
      const row = [];
      for (let j = 0; j < nc; j++) row.push(g[r - 1 + i] && g[r - 1 + i][c - 1 + j] !== undefined ? g[r - 1 + i][c - 1 + j] : "");
      out.push(row);
    }
    return out;
  };
  return {
    getDataRange: () => ({ getValues: () => read(1, 1, Math.max(lastRow(), 1), Math.max(lastCol(), 1)) }),
    getRange: (r, c, nr, nc) => ({
      setValue: v => { ensure(r, c); g[r - 1][c - 1] = v; },
      setValues: vals => { ensure(r - 1 + vals.length, c - 1 + vals[0].length); vals.forEach((row, i) => row.forEach((v, j) => { g[r - 1 + i][c - 1 + j] = v; })); },
      getValues: () => read(r, c, nr || 1, nc || 1)
    }),
    appendRow: arr => { g.push(arr.slice()); },
    deleteRow: r => { g.splice(r - 1, 1); },
    getLastRow: lastRow
  };
}
const DriveApp = {
  getFolderById: id => FolderW(DB.nodes[id]),
  getFileById: id => FileW(DB.nodes[id]),
  getRootFolder: () => FolderW(DB.nodes.ROOT)
};
const SpreadsheetApp = {
  openById: id => ({ getId: () => id, getSheets: () => [SheetW(DB.nodes[id])] }),
  create: name => {
    const n = node({ name: name, mime: SHEET_MIME, grid: [], parent: "ROOT" });
    return { getId: () => n.id, getSheets: () => [SheetW(n)] };
  },
  flush: () => {}
};
const SLACK = [];
const UrlFetchApp = {
  fetch: (url, opt) => {
    SLACK.push(JSON.parse(opt.payload).text);
    return { getResponseCode: () => 200, getContentText: () => "ok" };
  }
};
const PROPS = {};
const PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (PROPS[k] === undefined ? null : PROPS[k]),
    setProperty: (k, v) => { PROPS[k] = v; }
  })
};
const p2 = n => String(n).padStart(2, "0");
const Utilities = {
  formatDate: (d, tz, fmt) => fmt
    .replace("yyyy", d.getFullYear()).replace("MM", p2(d.getMonth() + 1)).replace("dd", p2(d.getDate()))
    .replace("HH", p2(d.getHours())).replace("mm", p2(d.getMinutes())).replace("ss", p2(d.getSeconds()))
    .replace("'T'", "T").replace("XXX", "+09:00")
};
const LOGS = [];
const Logger = { log: m => LOGS.push(String(m)) };

/* ==========================================================================
   本物のコードを読み込む（update-data.gs の部品 ＋ intake-v2.gs の全部）
   ========================================================================== */
eval(pick(gs, "var LIMITLESS_FOLDER_ID", "// ===== STEP1"));
eval(pick(gs, "/** ファイルを別フォルダへ移す", "/** 「=」で始まる文字列を"));
eval(pick(gs, "function safeCell_", "/* GOKIGEN台帳のファイル名"));
eval(pick(gs, "function normHead_", "// 見出し行を探して"));
eval(pick(gs, "// ===== 変換ヘルパー =====", "// ===== GitHub ====="));
eval(pick(iv, "var V2 = {", "/* ====================================================================="));
eval(pick(iv, "var V2_NAME_RE", "/* ===== v2 検品 ここまで ===== */"));
eval(pick(iv, "/** GOKIGEN台帳フォルダ直下のフォルダ", "/* =====================================================================\n   ===== STEP0"));
eval(pick(html, "/** 取込の時刻を短く出す", "/* ===== v2 取込バッジ ここまで ===== */"));

/* ==========================================================================
   下ごしらえ：台帳フォルダ・schemaフォルダ・GOKIGEN台帳_base を用意する
   ========================================================================== */
node({ name: "マイドライブ", folder: true, parent: null }, "ROOT");
node({ name: "GOKIGEN台帳", folder: true, parent: "ROOT" }, CONFIG.gokigenFolderId);
node({ name: "Udemy台帳",   folder: true, parent: "ROOT" }, CONFIG.udemyFolderId);
node({ name: "リミットレス台帳", folder: true, parent: "ROOT" }, CONFIG.limitlessFolderId);
node({ name: "経済台帳",     folder: true, parent: "ROOT" }, CONFIG.ecoFolderId);

const schemaFolder = v2Folder_(V2.schemaName);
V2.ledgers.forEach(led => {
  schemaFolder.createFile(led + ".json",
    fs.readFileSync(path.join(root, "schema", led + ".json"), "utf8"), "application/json");
});
// 既にある台帳（見出しだけ入っている状態から始める）
const GOKIGEN_HEAD = ["日付","曜日","体重","体脂肪率","筋肉量","内臓脂肪","体年齢",
                      "血圧上","血圧下","ご機嫌度","睡眠","運動","会食","ルーティン","一言"];
node({ name: "GOKIGEN台帳_base", mime: SHEET_MIME, parent: CONFIG.gokigenFolderId,
       grid: [GOKIGEN_HEAD.slice(), ["2026-09-13","日",83.4,"","","","","","","7/10",70,"","","",""]] });
node({ name: "Udemy台帳_base", mime: SHEET_MIME, parent: CONFIG.udemyFolderId,
       grid: [["記録日","基準時刻","コースID","コース名","公開年月","累計登録","月間登録","累計収益(USD)","評価","施策メモ","出所"]] });
node({ name: "経済台帳_base", mime: SHEET_MIME, parent: CONFIG.ecoFolderId,
       grid: [["記録日","口座","区分","評価額","通貨","出所"]] });

PROPS[V2.slackProp] = "https://hooks.slack.test/gokigen";   // #gokigen-取込 のWebhook（作り物）

const box  = v2Folder_(V2.boxName);
const done = v2Folder_(V2.doneName);
const errB = v2Folder_(V2.errName);
const put  = (name, text, mime) => box.createFile(name, text, mime || "application/json");
const baseGrid = name => DB.nodes[Object.keys(DB.nodes).find(k => DB.nodes[k].name === name)].grid;
const rowsOf = name => baseGrid(name).slice(1).filter(r => r.some(c => c !== "" && c != null));
const lastSlack = () => SLACK[SLACK.length - 1];
const appState = () => ikState({ meta: { intake: v2IntakeMeta_() } });

const GOKIGEN_OK = JSON.stringify({
  date: "2026-09-14", weekday: "月",
  weight_kg: 83.1, fat_pct: 30.2, muscle_kg: 55.1, visceral_lv: 10, body_age: 61,
  bp_high: null, bp_low: null, mood_10: 8,
  sleep_score: 64, readiness: 78, activity: 80,
  exercise: "", dining: "", routine_pct: null,
  note: "9/12 15kmウォーキング。9/13欠測"
});
const udemyCourses = n => {
  const cs = [];
  for (let i = 1; i <= n; i++) {
    cs.push({ id: "C" + p2(Math.min(i, 10)), name: "講座" + i, published: "2021-10",
              cum_enroll: 1000 + i, month_enroll: 10, cum_revenue_usd: 100.5, rating: 4.5, memo: "" });
  }
  if (n > 10) { cs[10].id = "C10"; cs[10].name = "全体"; }   // 11本目＝「全体」行が混ざった形
  return cs;
};

/* ==========================================================================
   ① 正常JSON → ✅通知・base1行追加・アプリ反映
   ========================================================================== */
console.log("\n【STEP5-①】正常なJSON → ✅通知・台帳に1行・アプリに反映");
const before1 = rowsOf("GOKIGEN台帳_base").length;
put("intake_gokigen_2026-09-14_0734.json", GOKIGEN_OK);
let r = runIntake_();
eq(r.ok, 1, "①-1 取込OKが1件");
eq(r.ng, 0, "①-2 NGは0件");
has(lastSlack(), "✅", "①-3 Slackに✅の1行が出る");
has(lastSlack(), "gokigen", "①-4 Slackの1行に台帳名が入る");
has(lastSlack(), "83.1kg", "①-5 Slackの1行に体重が入る（何が入ったか一目で分かる）");
eq(rowsOf("GOKIGEN台帳_base").length, before1 + 1, "①-6 GOKIGEN台帳_base が1行だけ増える");
const row1 = rowsOf("GOKIGEN台帳_base").pop();
eq(row1[0], "2026-09-14", "①-7 日付が入る");
eq(row1[2], 83.1, "①-8 体重が入る");
eq(String(row1[9]).replace(/^'/, ""), "8/10", "①-9 ご機嫌度は満点10点の形で入る（日付に化けない守りつき）");
const head1 = baseGrid("GOKIGEN台帳_base")[0];
ok(head1.indexOf("Readiness") >= 0 && head1.indexOf("活動量") >= 0,
   "①-10 台帳に無かった列（Readiness・活動量）は右端に足して黙って捨てない", head1.join("/"));
eq(kids(box._n.id).length, 0, "①-11 取込箱は空になる");
eq(kids(done._n.id).filter(n => n.name.indexOf("intake_gokigen") === 0).length, 1, "①-12 ファイルは📦_取込済へ移る");
let st = appState();
eq(st.level, "ok", "①-13 アプリのバッジは✅（緑）");
has(st.text, "最終取込", "①-14 アプリに「最終取込」が出る");
has(st.text, "gokigen", "①-15 どの台帳が入ったかが出る");

/* ==========================================================================
   ② Googleドキュメントを取込箱に置く → ❌通知・エラー箱
   （9/14の事故：自由文のGoogleドキュメントをGASが素通りした）
   ========================================================================== */
console.log("\n【STEP5-②】Googleドキュメントを置く → ❌通知・エラー箱");
put("intake_gokigen_2026-09-15_0700.json", "きょうは83.0kgでした。よく眠れた。",
    "application/vnd.google-apps.document");
r = runIntake_();
eq(r.ng, 1, "②-1 NGが1件");
has(lastSlack(), "❌", "②-2 Slackに❌が出る（黙って素通りしない）");
has(r.results[0].errors[0], "mimeType", "②-3 理由がmimeTypeだと分かる");
eq(kids(errB._n.id).filter(n => n.name.indexOf("intake_gokigen_2026-09-15") === 0 && n.mime !== "text/plain").length,
   1, "②-4 ファイルは⚠️_エラー箱へ移る");
const reason = kids(errB._n.id).find(n => n.name.indexOf("_エラー理由.txt") > 0);
ok(!!reason, "②-5 理由ファイルが隣に置かれる", "見つからない");
has(reason.text, "mimeType", "②-6 理由ファイルに何が違反かが1行で書いてある");
st = appState();
eq(st.level, "warn", "②-7 アプリのバッジは⚠️（赤）");
has(st.text, "未取込あり", "②-8 アプリに「未取込あり」が出る");

/* ==========================================================================
   ③ udemy 11要素 → ❌（8/18の事故：「全体」行が11本目として二重計上された）
   ========================================================================== */
console.log("\n【STEP5-③】udemy courses が11件 → ❌");
put("intake_udemy_2026-09-16_0630.json",
    JSON.stringify({ date: "2026-09-16", time: "6:30", src: "Udemy画面", courses: udemyCourses(11) }));
r = runIntake_();
eq(r.ng, 1, "③-1 NGになる");
has(r.results[0].errors.join(" / "), "courses", "③-2 理由がcoursesの件数だと分かる");
has(r.results[0].errors.join(" / "), "11件", "③-3 何件だったかが書いてある");
eq(rowsOf("Udemy台帳_base").length, 0, "③-4 台帳には1行も入らない");
// 10件ちょうどなら通る（門番が厳しすぎて正常も止める、では困る）
put("intake_udemy_2026-09-16_0631.json",
    JSON.stringify({ date: "2026-09-16", time: "6:30", src: "Udemy画面", courses: udemyCourses(10) }));
r = runIntake_();
eq(r.ok, 1, "③-5 10件ちょうどなら通る");
eq(rowsOf("Udemy台帳_base").length, 10, "③-6 10行が台帳に入る");
const uHead = baseGrid("Udemy台帳_base")[0];
eq(uHead.length, 11, "③-7 見出しは増えない（「累計収益(USD)」と「累計収益USD」を別の列にしない）");

/* ==========================================================================
   ④ economy「合計」行 → ❌（8/18・8/23の事故：小計行の混入で合計が2倍）
   ========================================================================== */
console.log("\n【STEP5-④】economy に「合計」の行 → ❌");
put("intake_economy_2026-09-17_0700.json", JSON.stringify({
  date: "2026-09-17",
  items: [
    { name: "SBI 米国株式", cat: "米国株式", amount: 6205864, currency: "JPY", src: "SBIメイン" },
    { name: "SBI 合計",     cat: "現金",     amount: 8521809, currency: "JPY", src: "SBIメイン" }
  ]
}));
r = runIntake_();
eq(r.ng, 1, "④-1 NGになる");
has(r.results[0].errors.join(" / "), "合計", "④-2 理由が「合計」の行だと分かる");
has(r.results[0].errors.join(" / "), "2件目", "④-3 何件目の行かが書いてある");
eq(rowsOf("経済台帳_base").length, 0, "④-4 台帳には1行も入らない");
// 区分に「総括」と書いた場合も同じく止まる
put("intake_economy_2026-09-17_0701.json", JSON.stringify({
  date: "2026-09-17",
  items: [{ name: "野村 預り金", cat: "総括", amount: 1105000, currency: "JPY", src: "野村" }]
}));
r = runIntake_();
eq(r.ng, 1, "④-5 区分「総括」も止まる");
// 出所が5つのどれでもない場合も止まる
put("intake_economy_2026-09-17_0702.json", JSON.stringify({
  date: "2026-09-17",
  items: [{ name: "楽天証券", cat: "米国株式", amount: 100, currency: "JPY", src: "楽天" }]
}));
r = runIntake_();
eq(r.ng, 1, "④-6 出所が5つのどれでもなければ止まる");
has(r.results[0].errors.join(" / "), "SBIメイン", "④-7 使える出所を理由に並べる");
// 明細だけなら通る
put("intake_economy_2026-09-17_0703.json", JSON.stringify({
  date: "2026-09-17",
  items: [
    { name: "SBI 米国株式", cat: "米国株式", amount: 6205864, currency: "JPY", src: "SBIメイン" },
    { name: "野村 預り金",   cat: "現金",     amount: 1105000, currency: "JPY", src: "野村" }
  ]
}));
r = runIntake_();
eq(r.ok, 1, "④-8 明細だけなら通る");
eq(rowsOf("経済台帳_base").length, 2, "④-9 2行が台帳に入る");
eq(baseGrid("経済台帳_base")[0].length, 6, "④-10 「口座」と「口座/資産名」を別の列にしない");

/* ==========================================================================
   ⑤ weight 830 → ❌（レンジ）
   ========================================================================== */
console.log("\n【STEP5-⑤】weight 830 → ❌（妥当レンジの門番）");
put("intake_gokigen_2026-09-18_0700.json",
    JSON.stringify({ date: "2026-09-18", weekday: "金", weight_kg: 830, sleep_score: 64 }));
r = runIntake_();
eq(r.ng, 1, "⑤-1 NGになる");
has(r.results[0].errors.join(" / "), "範囲外", "⑤-2 理由が範囲外だと分かる");
has(r.results[0].errors.join(" / "), "60〜100", "⑤-3 正しい範囲が書いてある");
// 日付がファイル名と食い違うのも止める
put("intake_gokigen_2026-09-18_0701.json",
    JSON.stringify({ date: "2026-09-17", weekday: "金", weight_kg: 83.0 }));
r = runIntake_();
eq(r.ng, 1, "⑤-4 中の日付がファイル名と違えば止まる");
has(r.results[0].errors.join(" / "), "ファイル名の日付と違う", "⑤-5 理由が日付の食い違いだと分かる");
// キーの書き間違いも止める
put("intake_gokigen_2026-09-18_0702.json",
    JSON.stringify({ date: "2026-09-18", weight: 83.0 }));
r = runIntake_();
eq(r.ng, 1, "⑤-6 キーの書き間違い（weight）も止まる");
has(r.results[0].errors.join(" / "), "知らないキー", "⑤-7 理由が書き間違いだと分かる");

/* ==========================================================================
   ⑥ 取込箱に残置ファイル → アプリ⚠️
   （「ファイルはあるのに数字が動かない」を構造的に不可能にする）
   ========================================================================== */
console.log("\n【STEP5-⑥】取込箱にファイルが残っている → アプリ⚠️");
const keep = V2.maxPerRun;
V2.maxPerRun = 1;                       // 1回で処理しきれない状況を作る
put("intake_gokigen_2026-09-19_0700.json",
    JSON.stringify({ date: "2026-09-19", weekday: "土", weight_kg: 83.0, sleep_score: 70 }));
put("intake_limitless_2026-09-19_0800.json", JSON.stringify({
  date: "2026-09-19", rows: [{ kind: "🔥トライ,🌱初めて", text: "初めてテロップを焼き込んだ", who: "", src: "リミットレス" }]
}));
r = runIntake_();
V2.maxPerRun = keep;
eq(r.pending.length, 1, "⑥-1 取込箱に残ったファイルが1件ある");
has(lastSlack(), "取込箱に", "⑥-2 残っていることがSlackにも出る");
st = appState();
eq(st.level, "warn", "⑥-3 アプリのバッジは⚠️（赤）");
has(st.text, "未取込あり", "⑥-4 アプリに「未取込あり」が出る");
has(st.text, "limitless", "⑥-5 どの台帳が未取込かが分かる");
ok(st.detail.join(" / ").indexOf("取込箱に残っています") >= 0,
   "⑥-6 詳細に残っているファイル名が出る", st.detail.join(" / "));
r = runIntake_();                        // 次の実行で残りが片づく
eq(r.pending.length, 0, "⑥-7 次の実行で取込箱は空になる");
eq(appState().level, "ok", "⑥-8 片づけば✅に戻る");

/* ==========================================================================
   ⑦ 同日2回投入 → 新しい方が正本
   ========================================================================== */
console.log("\n【STEP5-⑦】同じ日に2回投入 → あとの時刻が正本（行は増えない）");
const dayRows = d => rowsOf("GOKIGEN台帳_base").filter(x => String(x[0]) === d);
put("intake_gokigen_2026-09-20_0700.json",
    JSON.stringify({ date: "2026-09-20", weekday: "日", weight_kg: 84.0, sleep_score: 60 }));
runIntake_();
eq(dayRows("2026-09-20").length, 1, "⑦-1 まず1行入る");
eq(dayRows("2026-09-20")[0][2], 84.0, "⑦-2 体重は84.0");
put("intake_gokigen_2026-09-20_2100.json",
    JSON.stringify({ date: "2026-09-20", weekday: "日", weight_kg: 83.5, sleep_score: 72 }));
r = runIntake_();
eq(dayRows("2026-09-20").length, 1, "⑦-3 2回目でも行は増えない（1日1行）");
eq(dayRows("2026-09-20")[0][2], 83.5, "⑦-4 あとに出した83.5が正本になる");
eq(r.results[0].wrote.replaced, 1, "⑦-5 古い行を1行置き換えたと記録に残る");
// 同じ実行の中に2本入っていても、時刻の遅い方が勝つ
put("intake_gokigen_2026-09-21_0700.json",
    JSON.stringify({ date: "2026-09-21", weekday: "月", weight_kg: 85.0 }));
put("intake_gokigen_2026-09-21_2200.json",
    JSON.stringify({ date: "2026-09-21", weekday: "月", weight_kg: 82.8 }));
runIntake_();
eq(dayRows("2026-09-21").length, 1, "⑦-6 1回の実行に2本あっても1行だけ");
eq(dayRows("2026-09-21")[0][2], 82.8, "⑦-7 時刻の遅い22:00の方が正本になる");

/* ==========================================================================
   おまけ：沈黙禁止（何も無い日でもSlackに1行出る）と、スキーマ7本の健全性
   ========================================================================== */
console.log("\n【沈黙禁止】何も無い日でも通知が出る");
const n0 = SLACK.length;
r = runIntake_();
eq(SLACK.length, n0 + 1, "取込箱が空の日もSlackに1行出る（来ない日があれば、それ自体が異常）");
has(lastSlack(), "取込箱は空", "空だったことが分かる文面");

console.log("\n【スキーマ】7本そろっていて、どれも検品に使える形");
V2.ledgers.forEach(led => {
  const s = JSON.parse(fs.readFileSync(path.join(root, "schema", led + ".json"), "utf8"));
  const okShape = s.ledger === led && s.fileNamePattern && s.sheetName && s.fields &&
                  (s.shape === "single" || s.rowFields);
  ok(okShape, "schema/" + led + ".json が型どおり", JSON.stringify(s).slice(0, 120));
  ok(new RegExp(s.fileNamePattern).test("intake_" + led + "_2026-09-14_0734.json"),
     "schema/" + led + ".json のファイル名の型が実際の名前に当たる", s.fileNamePattern);
});

console.log("\n【アプリの配線】");
has(html, 'id="ikBar"', "家画面の最上段に取込バッジのDOMがある");
has(html, "renderIntake();", "renderAll から呼ばれている");
has(html, "ikState(DATA)", "アプリは meta.intake を読むだけ（自分で数えない）");
has(html, "data.meta.intake", "読むのは data.json の meta.intake ひとつ");
has(gs, "meta: { intake: intakeMeta }", "data.json に meta.intake が載る");
has(gs, "intake = runIntake_();", "1日4回の自動実行の冒頭で取込が走る");

console.log(fail ? "\n💥 " + fail + "件ダメでした" : "\n🎉 全部そろっています");
process.exit(fail ? 1 : 0);
