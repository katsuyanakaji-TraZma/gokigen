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
  // スプレッドシートは複数シートを持てる（Udemy台帳_base の1枚目はダッシュボード）
  if (o.mime === SHEET_MIME && !o.tabs) o.tabs = [{ name: "シート1", grid: o.grid || [] }];
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
      tabs: n.tabs ? JSON.parse(JSON.stringify(n.tabs)) : null
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
function SheetW(tab) {
  const g = tab.grid;
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
    getName: () => tab.name,
    getLastColumn: lastCol,
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
  openById: id => ({
    getId: () => id,
    getSheets: () => DB.nodes[id].tabs.map(SheetW),
    getSheetByName: nm => {
      const t = DB.nodes[id].tabs.find(x => x.name === nm);
      return t ? SheetW(t) : null;
    }
  }),
  create: name => {
    const n = node({ name: name, mime: SHEET_MIME, tabs: [{ name: "シート1", grid: [] }], parent: "ROOT" });
    return { getId: () => n.id, getSheets: () => n.tabs.map(SheetW),
             getSheetByName: nm => { const t = n.tabs.find(x => x.name === nm); return t ? SheetW(t) : null; } };
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
eval(pick(gs, "// 統合したUdemyログに書き出す列", "function consolidateUdemyDuplicates_"));  // UDEMY_MERGE_HEAD
eval(pick(gs, "// ===== 変換ヘルパー =====", "// ===== GitHub ====="));
eval(pick(iv, "var V2 = {", "/* ====================================================================="));
eval(pick(iv, "var V2_NAME_RE", "/* ===== v2 検品 ここまで ===== */"));
eval(pick(iv, "/** GOKIGEN台帳フォルダ直下のフォルダ"));   // STEP0・STEP2 の関数まで全部
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
node({ name: "GOKIGEN台帳_base", mime: SHEET_MIME, parent: CONFIG.gokigenFolderId, tabs: [
  { name: "シート1", grid: [GOKIGEN_HEAD.slice(), ["2026-09-13","日",83.4,"","","","","","","7/10",70,"","","",""]] }] });
/* Udemy台帳_base は**複数シート**。1枚目はダッシュボードで、台帳の実体は「台帳ログ」。
   1枚目に書き込むとダッシュボードが壊れる（2026-09-20にSTEP2で実際に踏んだ形をそのまま再現） */
node({ name: "Udemy台帳_base", mime: SHEET_MIME, parent: CONFIG.udemyFolderId, tabs: [
  { name: "ダッシュボード", grid: [
    ["Udemy 講座ポートフォリオ ダッシュボード","","","","","","","","",""],
    ["講座","累計登録","構成比","直近ペース(人/日)","モメンタム","30日換算 新規","ARPU(USD)","評価","公開後日数","次のアクション"],
    ["開くリーダー",17791,"25.6%",8.6,"1.37x",259,"$3.77",4.18,"1,773日","安定"]] },
  { name: "台帳ログ", grid: [
    ["記録日","基準時刻","コースID","コース名","公開年月","累計登録","月間登録","累計収益(USD)","評価","施策メモ","出所"]] },
  { name: "コースマスタ", grid: [["コースID","略称","公開日"],["C01","組織適応の教科書","2026/6/1"]] }
] });
/* 経済台帳_base の実物の見出し。「記録日」ではなく「日付」、「口座/資産名」ではなく「項目」、
   「評価額」ではなく「評価額円」、「出所」ではなく「備考」。**「通貨」の列は無い** */
node({ name: "経済台帳_base", mime: SHEET_MIME, parent: CONFIG.ecoFolderId, tabs: [
  { name: "シート1", grid: [
    ["日付","区分","項目","数量・額面","評価額円","評価損益円","損益率","備考"],
    ["2026-08-16","総括","SBI証券口座 合計","",13104897,2246626,"+20.69%","前日比0円"]] }
] });

PROPS[V2.slackProp] = "https://hooks.slack.test/gokigen";   // #gokigen-取込 のWebhook（作り物）

const box  = v2Folder_(V2.boxName);
const done = v2Folder_(V2.doneName);
const errB = v2Folder_(V2.errName);
const put  = (name, text, mime) => box.createFile(name, text, mime || "application/json");
const baseNode = name => DB.nodes[Object.keys(DB.nodes).find(k => DB.nodes[k].name === name && !DB.nodes[k].folder)];
const baseGrid = (name, tab) => {
  const n = baseNode(name);
  const t = tab ? n.tabs.find(x => x.name === tab) : n.tabs[0];
  return t.grid;
};
const rowsOf = (name, tab) => baseGrid(name, tab).slice(1).filter(r => r.some(c => c !== "" && c != null));
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
eq(rowsOf("Udemy台帳_base", "台帳ログ").length, 0, "③-4 台帳には1行も入らない");
// 10件ちょうどなら通る（門番が厳しすぎて正常も止める、では困る）
put("intake_udemy_2026-09-16_0631.json",
    JSON.stringify({ date: "2026-09-16", time: "6:30", src: "Udemy画面", courses: udemyCourses(10) }));
r = runIntake_();
eq(r.ok, 1, "③-5 10件ちょうどなら通る");
eq(rowsOf("Udemy台帳_base", "台帳ログ").length, 10, "③-6 10行が台帳に入る");
const uHead = baseGrid("Udemy台帳_base", "台帳ログ")[0];
eq(uHead.length, 11, "③-7 見出しは増えない（「累計収益(USD)」と「累計収益USD」を別の列にしない）");
eq(baseGrid("Udemy台帳_base", "ダッシュボード").length, 3,
   "③-8 1枚目のダッシュボードには1行も書き込まない（書いたらグラフが壊れる）");
eq(baseGrid("Udemy台帳_base", "コースマスタ").length, 2, "③-9 コースマスタにも書き込まない");
has(r.results[0].wrote.sheet, "台帳ログ", "③-10 書き込み先が「台帳ログ」だと記録に残る");

/* ==========================================================================
   ④ economy「合計」行 → ❌（8/18・8/23の事故：小計行の混入で合計が2倍）
   ========================================================================== */
console.log("\n【STEP5-④】economy に「合計」の行 → ❌");
const ecoBefore = rowsOf("経済台帳_base").length;          // 実物と同じく「総括」行が1行ある
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
eq(rowsOf("経済台帳_base").length, ecoBefore, "④-4 台帳には1行も入らない（元の行はそのまま）");
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
eq(rowsOf("経済台帳_base").length, ecoBefore + 2, "④-9 2行が台帳に入る");
/* 実物の見出し（日付／区分／項目／…／備考）にそのまま乗せる。
   「記録日」「口座/資産名」「出所」という**別の列を作らない**。無い「通貨」だけを右端に足す。 */
const ecoHead = baseGrid("経済台帳_base")[0];
ok(ecoHead.indexOf("記録日") < 0 && ecoHead.indexOf("口座/資産名") < 0 && ecoHead.indexOf("出所") < 0,
   "④-10 実物の見出し（日付・項目・備考）に乗せ、別名の列を二重に作らない", ecoHead.join("/"));
eq(ecoHead.length, 9, "④-11 元の8列＋足りなかった「通貨」の1列だけ");
eq(ecoHead[8], "通貨", "④-12 足した列は右端（既存の列はずれない）");
const ecoRow = rowsOf("経済台帳_base").pop();
eq(ecoRow[0], "2026-09-17", "④-13 日付が「日付」列に入る");
eq(ecoRow[2], "野村 預り金", "④-14 口座名が「項目」列に入る");
eq(ecoRow[4], 1105000, "④-15 金額が「評価額円」列に入る");
eq(String(ecoRow[7]).replace(/^'/, ""), "野村", "④-16 出所が「備考」列に入る");
eq(String(ecoRow[8]).replace(/^'/, ""), "JPY", "④-17 通貨が新しい列に入る");

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

/* ==========================================================================
   STEP2 移行：日次ログ → 台帳_base
   （2026-09-20に「Udemy台帳_base に列がありません／経済台帳_base に列がありません」で
     止まった件の再発防止。原因は見出しが無いことではなく、1枚目がダッシュボードだったこと） =
   ========================================================================== */
console.log("\n【STEP2】日次ログ → 台帳_base（列の名前が違っても・シートが複数でも通る）");
const udemyFolder = FolderW(DB.nodes[CONFIG.udemyFolderId]);
const ecoFolder   = FolderW(DB.nodes[CONFIG.ecoFolderId]);
node({ name: "Udemy台帳ログ_2026-09-15", mime: SHEET_MIME, parent: CONFIG.udemyFolderId, tabs: [
  { name: "シート1", grid: [
    ["記録日","基準時刻","コースID","コース名","公開年月","累計登録","累計収益(USD)","評価","出所"],
    ["2026-09-15","6:30","C01","組織適応の教科書","2026-06",300,210.5,4.81,"Udemy画面"],
    ["2026-09-15","6:30","C02","老害とは呼ばせない","2025-07",4850,7600.0,4.01,"Udemy画面"]] }] });
node({ name: "経済台帳ログ_2026-09-15", mime: SHEET_MIME, parent: CONFIG.ecoFolderId, tabs: [
  { name: "シート1", grid: [
    ["記録日","口座/資産名","区分","評価額","通貨","出所"],
    ["2026-09-15","SBI 米国株式","米国株式",6300000,"JPY","SBIメイン"]] }] });

const plan = {};
v2MigratePlan_().forEach(c => { plan[c.label] = c; });

const uLogBefore = rowsOf("Udemy台帳_base", "台帳ログ").length;
let mg = v2Migrate_(plan.udemy);
ok(mg.ok, "STEP2-1 udemy が「列がありません」で止まらない", mg.msg);
eq(rowsOf("Udemy台帳_base", "台帳ログ").length, uLogBefore + 2, "STEP2-2 台帳ログに2行増える");
eq(baseGrid("Udemy台帳_base", "ダッシュボード").length, 3, "STEP2-3 ダッシュボードは1行も動かない");
has(mg.msg, "台帳ログ", "STEP2-4 どのシートに入れたかがログに残る");

const ecoBefore2 = rowsOf("経済台帳_base").length;
mg = v2Migrate_(plan.economy);
ok(mg.ok, "STEP2-5 economy が「列がありません」で止まらない", mg.msg);
eq(rowsOf("経済台帳_base").length, ecoBefore2 + 1, "STEP2-6 経済台帳_base に1行増える");
const mRow = rowsOf("経済台帳_base").pop();
eq(mRow[0], "2026-09-15", "STEP2-7 「記録日」が実物の「日付」列に入る");
eq(mRow[2], "SBI 米国株式", "STEP2-8 「口座/資産名」が実物の「項目」列に入る");
eq(mRow[4], 6300000, "STEP2-9 「評価額」が実物の「評価額円」列に入る");
eq(mRow[7], "SBIメイン", "STEP2-10 「出所」が実物の「備考」列に入る");
eq(baseGrid("経済台帳_base")[0][8], "通貨", "STEP2-11 元々無かった「通貨」だけが右端に足される");

// 取り込んだログは削除せず _v1アーカイブ へ
const arc = v2Folder_(V2.archiveV1Name);
eq(kids(arc._n.id).filter(n => n.name.indexOf("経済台帳ログ_") === 0).length, 1,
   "STEP2-12 取り込んだログは削除せず _v1アーカイブ へ移る");

// 何度実行しても二重にならない
const again = rowsOf("経済台帳_base").length;
v2Migrate_(plan.economy);
eq(rowsOf("経済台帳_base").length, again, "STEP2-13 もう一度実行しても行は増えない");

/* ==========================================================================
   営業部の物差し（eigyobu）：UB内訳・クーポン別の購入数（2026-09-26 追加）
   ========================================================================== */
console.log("\n【営業部】eigyobu の取込");
const EIGYO_OK = {
  date: "2026-10-01", month: "2026-09", src: "Udemy講師画面スクショ2枚",
  rows: [
    { kind: "UB登録", course_id: null, coupon: null, channel: null, period: "過去30日間", value: 1200, memo: "" },
    { kind: "クーポン別購入", course_id: null, coupon: "SEP2026", channel: null, period: "2026年9月", value: 5, memo: "" }
  ]
};
put("intake_eigyobu_2026-10-01_0700.json", JSON.stringify(EIGYO_OK));
r = runIntake_();
eq(r.ok, 1, "営-1 型どおりなら通る");
const eFolder = Object.keys(DB.nodes).find(k => DB.nodes[k].name === "営業部_物差し" && DB.nodes[k].folder);
ok(!!eFolder, "営-2 GOKIGEN台帳の下に「営業部_物差し」フォルダができる");
const eBase = Object.keys(DB.nodes).find(k => DB.nodes[k].name === "営業部_物差し台帳_base");
eq(DB.nodes[eBase].parent, eFolder, "営-3 台帳は「営業部_物差し」フォルダの中（GOKIGEN台帳の直下に置かない）");
eq(rowsOf("営業部_物差し台帳_base").length, 2, "営-4 2行が台帳に入る");
has(lastSlack(), "2026-09 2行", "営-5 Slackの1行に対象月と行数が出る");
// 同じ日にもう一度（あとの時刻が正本）→ 行は増えない
put("intake_eigyobu_2026-10-01_0730.json", JSON.stringify(Object.assign({}, EIGYO_OK, { rows: [EIGYO_OK.rows[0]] })));
r = runIntake_();
eq(rowsOf("営業部_物差し台帳_base").length, 1, "営-6 同じ記録日は置き換わる（二重にならない）");
// 合計行・知らない種別は止める
put("intake_eigyobu_2026-10-02_0700.json", JSON.stringify({ date: "2026-10-02", month: "2026-09", src: "",
  rows: [{ kind: "合計", course_id: null, coupon: null, channel: "全体", period: "", value: 300, memo: "" }] }));
r = runIntake_();
eq(r.ng, 1, "営-7 種別「合計」はNG");
put("intake_eigyobu_2026-10-02_0701.json", JSON.stringify({ date: "2026-10-02", month: "2026年9月", src: "",
  rows: [{ kind: "講座別購入", course_id: "C11", coupon: null, channel: null, period: "", value: 1, memo: "" }] }));
r = runIntake_();
has(r.results[0].errors.join(" / "), "対象月", "営-8 対象月の書き方違いを止める");
has(r.results[0].errors.join(" / "), "コースID", "営-9 C01〜C10以外のコースIDを止める");
eq(rowsOf("営業部_物差し台帳_base").length, 1, "営-10 NGのときは台帳に1行も入らない");
// お客様名は入れさせない（名前の欄は無い＝知らないキーとして止まる）
put("intake_eigyobu_2026-10-03_0700.json", JSON.stringify({ date: "2026-10-03", month: "2026-09", src: "",
  rows: [{ kind: "講座別購入", course_id: "C01", coupon: null, channel: null, period: "", value: 1, memo: "", customer: "山田太郎" }] }));
r = runIntake_();
eq(r.ng, 1, "営-11 お客様名（customer など名前の欄）が混ざったらNG");
eq(rowsOf("営業部_物差し台帳_base").length, 1, "営-12 そのときも台帳に1行も入らない");
put("intake_eigyobu_2026-10-04_0700.json", JSON.stringify({ date: "2026-10-04", month: "2026-09", src: "",
  rows: [{ kind: "月次収益USD", course_id: null, coupon: null, channel: null, period: "2026年9月", value: 2828.31, memo: "" }] }));
r = runIntake_();
eq(r.ok, 1, "営-13 収益レポートの月次収益（USD・小数）が通る");

console.log("\n【アプリの配線】");
has(html, 'id="ikBar"', "家画面の最上段に取込バッジのDOMがある");
has(html, "renderIntake();", "renderAll から呼ばれている");
has(html, "ikState(DATA)", "アプリは meta.intake を読むだけ（自分で数えない）");
has(html, "data.meta.intake", "読むのは data.json の meta.intake ひとつ");
has(gs, "meta: { intake: intakeMeta }", "data.json に meta.intake が載る");
has(gs, "intake = runIntake_();", "1日4回の自動実行の冒頭で取込が走る");

console.log(fail ? "\n💥 " + fail + "件ダメでした" : "\n🎉 全部そろっています");
process.exit(fail ? 1 : 0);
