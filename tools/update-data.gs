/**
 * GOKIGEN OS — data.json 自動生成スクリプト（Google Apps Script）
 *
 * やること：
 *   1. Googleドライブの「GOKIGEN台帳」「Udemy台帳」「リミットレス台帳」「経済台帳」の全ファイルと、
 *      GOKIGEN台帳フォルダの中の「未来ビジョン台帳」（Googleドキュメント）を読む
 *   2. 全期間を1つに統合する（日付が重複したら「新しいファイル」を優先）
 *   3. 知識の部屋の集計（knowledge）と、取込時の異常（warnings）を作る
 *   4. GitHub の katsuyanakaji-TraZma/gokigen に data.json を書き込む
 *   5. Vercel が自動でデプロイ → アプリが最新になる
 *
 * v1.4で足したもの（読むファイルは +1本、開くフォルダは +1つだけ）：
 *   ・WANT台帳（目標×差分の「目標」側）を**書いてあるまま**読む。
 *     自動／手動の仕分けも差分の計算もアプリ側でやるので、台帳に行が増えても
 *     目標値が書き換わっても、このスクリプトは1文字も直さなくていい。
 *   ・週報書棚フォルダの「いちばん新しいファイルの名前とリンク」だけを取る（中身は開かない）。
 *   ・経済台帳の「記録日ごとの総資産」（eco.history）＝アプリの推移線の材料。
 *   ・自己バージョン ver57.x（selfVersion）と、月次総括の器（monthlyReview）。
 *   ※ 新しいOAuthスコープは1つも増やしていない（本人への再承認は起きない）。
 *
 * v1.6で足したもの：
 *   ・Googleカレンダー（本人の primary）の「🎁ご褒美枠」を**読むだけ**。
 *     会食の「枠（空き）」と「予約」がここから来る（実績は今までどおり台帳の会食欄）。
 *     **appsscript.json の oauthScopes に calendar.readonly を1行足して再承認が必要**。
 *     tools/appsscript.json に貼り付け用の完成形を置いてある。
 *   ・note台帳（GOKIGEN台帳フォルダの中の「note台帳ログ_YYYY-MM-DD」）→ 仕事タブのnoteカード。
 *   ・Udemyの月間サニティの目安を 1,500人 → 1,800人 に引き上げ（正当な増加での誤検知を防ぐ）。
 *
 * v1.7で足したもの：
 *   ・行きたい場所台帳（GOKIGEN台帳フォルダの「行きたい場所台帳_base」）を読むだけ。
 *     家族の部屋から開く「行きたい場所マップ」（places.html）の材料。
 *     **新しいOAuthスコープはゼロ**（スプレッドシート1本を読むだけ）。台帳への書き戻しもしない。
 *   ・v1.7.1：低山台帳（「低山台帳_base」）も同じ考え方で読む。⛰低山タブ（山＋セット温泉）。
 *
 * 1日4回（8時・12時・18時・22時）自動実行。Google側のサーバーで動くので Mac mini の電源は関係ありません。
 * 前回の実行以降にどちらのフォルダにも新規/更新ファイルが無ければ、作り直さずスキップします。
 *
 * 初回だけ、この2つを1回ずつ実行してください：
 *   ① setupUdemyBase()  … Udemyの5年分履歴（xlsx）をスプレッドシート「Udemy台帳_base」に移植する
 *   ② setupTrigger()    … 1日4回の自動実行を予約する
 *
 * v1.2.1で、台帳ファイルが増えすぎて6分の実行制限に当たったため、次を足しました：
 *   ③ runConsolidateOnce() … 古い日次台帳を1本にまとめ、元ファイルは「圧縮済み」フォルダへ移す
 *                            （削除はしません。何度実行しても壊れません）
 *      まとめる範囲は CONFIG.consolidateBefore。まだ重いときは、この日付を先へ進めて
 *      もう一度実行すれば、その日付までの日次台帳がさらにまとまります。
 */

// ===== 設定 =====
// リミットレス台帳フォルダ（GOKIGENフォルダの中の「リミットレス台帳」）
// この中のスプレッドシートを全部読む：土台の「リミットレス台帳_base_v2」と、
// 日々増えていく「リミットレス台帳ログ_YYYY-MM-DD」。
var LIMITLESS_FOLDER_ID = '1UAbime-oSiN-OHEH2jh2tokBzfJw4Ayg';

// 経済台帳フォルダ（GOKIGENフォルダの中の「経済台帳（株式・債券・貴金属）」）
// v1.2.1でこちらに引っ越した。旧フォルダ 1koH3sVzVu2sqyJvSv5DDXh1MBwShKmAL はもう読まない。
var ECO_FOLDER_ID = '13oyaDeWl0nviGqLF_PblBhgGM-X4NsTR';

// v1.4：WANT台帳（目標×差分の「目標」側）。スプレッドシート1本。
// 列＝部屋／項目／目標値／期限／現状の取り方／備考。
// 行が増えても目標値が書き換わっても、コードは直さない（この1本を読むだけ）。
var WANT_FILE_ID = '1UgAb8OuWpIxvLyeDeuQRHQ2J5E04G3IZV-DMUD_h5k4';
// v1.7.2：WANT台帳も作り直されて「WANT台帳_base」になっていた。名前で探すのでIDは予備。
var WANT_FILE_NAME = 'WANT台帳_base';

// v1.4：週報書棚フォルダ（📖_週報書棚）。
// **中身は読まない**。いちばん新しいファイルの「名前とリンク」だけを取り、アプリはリンクを置くだけ。
// 中を解析しないので、OAuthのスコープは4本のまま増えない（＝再承認が起きない）。
var WEEKLY_FOLDER_ID = '1sV-u0tf2EJ0cEgUbI2Rt1fzS_gLWNRSk';

// v1.4：自己バージョン（ver57.x）の起点。誕生月を .00 として、月がひとつ進むごとに .01 上がる。
var BIRTH_DATE = '1969-04-30';

// v1.7：行きたい場所台帳（GOKIGEN台帳フォルダの中のスプレッドシート1本）。
// 家族の部屋から開く「行きたい場所マップ」（places.html）の材料。
// 名前でも探せるようにしてあるので、作り直してIDが変わっても止まらない。
var PLACES_FILE_ID = '18y_FjBcl6nYQmxkTAKJatsJsxeMnF_FKUJTO9A0vYHQ';
var PLACES_FILE_NAME = '行きたい場所台帳_base';

// v1.7.1：低山台帳（山＋セット温泉）。行きたい場所マップの「⛰低山」タブの材料。
// 100座を目標にしていて、登った数（状態＝済）をタブに出す。
var MTN_FILE_ID = '1KkHRijHmSY9UYJ3tV0YKqBmm-u1Sc8dZ8p7BzKFFQr0';
var MTN_FILE_NAME = '低山台帳_base';

// v1.6：会食の「枠と予約」はGoogleカレンダー（本人の primary）から読む。
// 今日から何ヶ月先まで見るか。ここを伸ばしても読むのはカレンダー1本だけ。
var CAL_MONTHS_AHEAD = 6;
// 1ヶ月に入れてよい会食の上限（本人の決め。アプリの「着地見込み」の物差し）。
var CAL_MONTH_CAP = 12;

var CONFIG = {
  gokigenFolderId: '1vJ7ddquLREjntkRUy235nv5FXaas2IoV',
  udemyFolderId:   '1g3hrPVRIYB_GOYho36DLRnITG_c5-elx',
  udemyXlsxId:     '1T7SE-LrYr4gtTxvyGkBDgNZ_4ruTnvJv', // 移植元。移植後は「_アーカイブ」に改名して以後さわらない
  udemyBaseName:    'Udemy台帳_base',
  udemyArchiveName: 'Udemyグラフ vol2_アーカイブ.xlsx',
  // v1.2で追加：リミットレス台帳（知識・精神）と経済台帳、未来ビジョン台帳
  limitlessFolderId: LIMITLESS_FOLDER_ID,
  limitlessBaseName: 'リミットレス台帳_base_v2',
  limitlessKeepDays: 180,          // data.jsonに残す日数（肥大化させない）
  ecoFolderId:  ECO_FOLDER_ID,
  ecoBaseName:  '経済台帳_base',
  // v1.4：目標×差分（WANT台帳）と週報書棚
  wantFileId:      WANT_FILE_ID,
  wantFileName:    WANT_FILE_NAME,
  weeklyFolderId:  WEEKLY_FOLDER_ID,
  birthDate:       BIRTH_DATE,
  // v1.6：Googleカレンダー（会食の枠・予約）と note台帳（GOKIGEN台帳フォルダの中）
  calMonthsAhead:  CAL_MONTHS_AHEAD,
  calMonthCap:     CAL_MONTH_CAP,
  noteDeltaPrefix: 'note台帳ログ_',   // GOKIGEN台帳フォルダ直下の「note台帳ログ_YYYY-MM-DD」
  // v1.7：行きたい場所台帳（表示専用。台帳への書き戻しは一切しない）
  placesFileId:   PLACES_FILE_ID,
  placesFileName: PLACES_FILE_NAME,
  // v1.7.1：低山台帳（こちらも読むだけ・書き戻しなし）
  mtnFileId:      MTN_FILE_ID,
  mtnFileName:    MTN_FILE_NAME,
  mtnGoal:        100,              // 低山100座。タブの「🏁n／100」の分母
  futureDocPrefix: '未来ビジョン台帳',  // GOKIGEN台帳フォルダの中のGoogleドキュメント
  // v1.2.1：台帳ファイルが増えすぎて6分の実行制限に当たったため、古い日次ファイルを1本にまとめる
  gokigenBaseName:  'GOKIGEN台帳_base',   // まとめ先（この1本だけ読めば7月以前が全部入る）
  consolidateBefore: '2026-07-31',        // この日付以前の日次ファイルをまとめる（ファイル名の日付で判定）
  archiveFolderName: '圧縮済み',           // まとめ終わった元ファイルの引っ越し先（削除はしない）
  updateHours:  [8, 12, 18, 22],   // 自動実行する時刻
  snapshotLimit: 30,               // data.jsonに残す「記録日ごとのスナップショット」の日数
  repoOwner: 'katsuyanakaji-TraZma',
  repoName:  'gokigen',
  filePath:  'data.json',
  branch:    'main'
};

// ===== STEP1: データ品質の門番（この範囲を外れた値は取り込まない） =====
var RANGE = {
  weight:   [70, 95],
  fat:      [15, 45],
  muscle:   [30, 80],
  visceral: [1, 30],
  bodyAge:  [50, 70],
  bpHigh:   [90, 200],
  bpLow:    [50, 130],
  sleep:    [0, 100],
  mood:     [1, 10],
  routine:  [0, 100]
};

var PROP_LAST_RUN = 'LAST_RUN_AT';

// GitHubトークンは「スクリプト プロパティ」に GITHUB_TOKEN という名前で保存します（コードに直接書かない）
function getToken_() {
  var t = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!t) throw new Error('GITHUB_TOKEN が未設定です。プロジェクトの設定 → スクリプト プロパティ に追加してください。');
  return t;
}

// ===== メイン =====
// 自動実行はこちら。台帳に動きが無ければ何もしません。
function main() { return run_(false); }
// 手で今すぐ更新したいとき用。ガードを無視して必ず作り直します。
function runNow() { return run_(true); }

function run_(force) {
  var props = PropertiesService.getScriptProperties();
  var startedAt = new Date();
  var last = props.getProperty(PROP_LAST_RUN);

  // ムダ打ち防止：前回実行以降に台帳フォルダへ新規/更新が無ければ、生成もデプロイもしない
  if (!force && last) {
    var changed = changedFilesSince_(new Date(last));
    if (!changed.length) {
      props.setProperty(PROP_LAST_RUN, iso_(startedAt));
      var skip = '⏭ 台帳に動きがないのでスキップしました（前回: ' + last + '）';
      Logger.log(skip);
      return skip;
    }
    Logger.log('更新のあったファイル: ' + changed.join(' / '));
  }

  var previous = fetchCurrentJson_();          // 失敗時のフォールバック用に、今公開中のdata.jsonを取得
  var data = buildData_(previous);
  var json = JSON.stringify(data, null, 2) + '\n';
  var result = pushToGitHub_(json, previous);
  props.setProperty(PROP_LAST_RUN, iso_(startedAt));
  Logger.log(result);
  return result;
}

// 台帳フォルダを見て、指定時刻より後に作られた／更新されたファイル名を返す
// v1.4：WANT台帳（目標を書き換えたら次の更新で反映されてほしい）と週報書棚もここに入れる
function changedFilesSince_(since) {
  var cutoff = since.getTime() - 2 * 60 * 1000;   // 取りこぼし防止に2分の余裕を見る
  var out = [];
  [CONFIG.gokigenFolderId, CONFIG.udemyFolderId,
   CONFIG.limitlessFolderId, CONFIG.ecoFolderId, CONFIG.weeklyFolderId].forEach(function (id) {
    try {
      var it = DriveApp.getFolderById(id).getFiles();
      while (it.hasNext()) {
        var f = it.next();
        if (f.isTrashed()) continue;                          // v1.7.2：ゴミ箱のものは見ない
        if (f.getLastUpdated().getTime() > cutoff) out.push(f.getName());
      }
    } catch (e) { Logger.log('フォルダを見られませんでした（先に進みます）: ' + id + ' / ' + e); }
  });
  try {
    var w = wantFile_();                                  // v1.7.2：名前で取った最新のもの
    if (w && w.getLastUpdated().getTime() > cutoff) out.push(w.getName());
  } catch (e) { Logger.log('WANT台帳を見られませんでした（先に進みます）: ' + e); }
  /* v1.7：行きたい場所台帳。GOKIGEN台帳フォルダの中にあるので上のループでも拾えるが、
     置き場所を移されても気づけるよう、ファイルそのものの更新時刻も見ておく。 */
  try {
    var pf = placesFile_();
    if (pf && pf.getLastUpdated().getTime() > cutoff) out.push(pf.getName());
  } catch (e) { Logger.log('行きたい場所台帳を見られませんでした（先に進みます）: ' + e); }
  try {
    var mf = mtnFile_();
    if (mf && mf.getLastUpdated().getTime() > cutoff) out.push(mf.getName());
  } catch (e) { Logger.log('低山台帳を見られませんでした（先に進みます）: ' + e); }
  /* v1.6：会食の枠は台帳ではなくカレンダーで動く（本人がタイトルを「予約済：家族」に
     書き換えた瞬間が更新のきっかけ）。ここを見ないと、台帳に動きが無い日は
     予約を入れてもアプリが古いままになる。読むのは今日〜先の「ご褒美枠」だけ。 */
  try {
    var from = new Date();
    var to = new Date(from.getTime());
    to.setMonth(to.getMonth() + CONFIG.calMonthsAhead);
    CalendarApp.getDefaultCalendar().getEvents(from, to).forEach(function (e) {
      if (!CAL_SLOT_RE.test(String(e.getTitle() || ''))) return;
      if (e.getLastUpdated().getTime() > cutoff) out.push('（カレンダー）' + e.getTitle());
    });
  } catch (e) { Logger.log('カレンダーを見られませんでした（先に進みます）: ' + e); }
  return out;
}

// 初回だけ実行：1日4回（8時・12時・18時・22時）の予約をセット
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'main') ScriptApp.deleteTrigger(t);
  });
  CONFIG.updateHours.forEach(function (h) {
    ScriptApp.newTrigger('main').timeBased().atHour(h).everyDays(1).create();
  });
  var msg = '✅ 自動実行を ' + CONFIG.updateHours.join('時 / ') + '時 の4回にセットしました' +
            '（タイムゾーン: ' + Session.getScriptTimeZone() + '）';
  Logger.log(msg);
  return msg;
}

// ===== STEP4: 一度だけの移植 =====
/**
 * 「Udemyグラフ vol2.xlsx」を Googleスプレッドシート に変換コピーし、
 * Udemy台帳フォルダに「Udemy台帳_base」として保存する。
 *
 * xlsx のままでは中のシートを読めないので、Drive API の files.copy に
 * mimeType: スプレッドシート を渡して変換する（コピーの時点で変換される）。
 * 変換後に「台帳ログ」「コースマスタ」が読めることを確かめてから、
 * 元の xlsx を「Udemyグラフ vol2_アーカイブ.xlsx」に改名する。
 * 2回目以降に実行しても、すでにあれば何もしない。
 */
function setupUdemyBase() {
  var already = findUdemyBase_();
  if (already) {
    var msg0 = 'すでに「' + CONFIG.udemyBaseName + '」があります: ' + already.getUrl();
    Logger.log(msg0);
    return msg0;
  }

  var res = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + CONFIG.udemyXlsxId + '/copy?supportsAllDrives=true',
    { method: 'post',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      contentType: 'application/json',
      payload: JSON.stringify({
        name: CONFIG.udemyBaseName,
        mimeType: MimeType.GOOGLE_SHEETS,          // ← これが「スプレッドシートへの変換」
        parents: [CONFIG.udemyFolderId]
      }),
      muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('変換コピーに失敗しました: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
  }
  var newId = JSON.parse(res.getContentText()).id;

  // 読めることを確認してからでないと、元ファイルの改名はしない
  var ss = SpreadsheetApp.openById(newId);
  var logSheet = ss.getSheetByName('台帳ログ');
  var mstSheet = ss.getSheetByName('コースマスタ');
  if (!logSheet) {
    DriveApp.getFileById(newId).setTrashed(true);
    throw new Error('変換はできましたが「台帳ログ」シートが見つかりません。元のxlsxはそのままにしました。');
  }
  var rows = readLedgerSheet_(logSheet, CONFIG.udemyBaseName);
  if (!rows.length) {
    DriveApp.getFileById(newId).setTrashed(true);
    throw new Error('「台帳ログ」から1行も読めませんでした。元のxlsxはそのままにしました。');
  }
  var dates = rows.map(function (r) { return r.date; }).sort();
  Logger.log('台帳ログ: ' + rows.length + '行（' + dates[0] + ' 〜 ' + dates[dates.length - 1] + '）');
  Logger.log('コースマスタ: ' + (mstSheet ? Math.max(0, mstSheet.getLastRow() - 1) + '件' : '見つかりません'));

  // ここまで確認できたので、元のxlsxをアーカイブ名にする（以後この運用では読まない）
  DriveApp.getFileById(CONFIG.udemyXlsxId).setName(CONFIG.udemyArchiveName);

  var msg = '✅ 「' + CONFIG.udemyBaseName + '」を作りました: ' + ss.getUrl() +
            '\n   元ファイルは「' + CONFIG.udemyArchiveName + '」に改名しました。';
  Logger.log(msg);
  return msg;
}

function findUdemyBase_() {
  // v1.7.2：ゴミ箱の同名ファイルを掴まないよう、共通の名前検索を使う
  return ledgerByName_(CONFIG.udemyBaseName, null, CONFIG.udemyFolderId);
}

// ===== v1.2.1: 台帳の整理（6分の実行制限に当たったための対策） =====
/**
 * 台帳ファイルが増えすぎて runNow が6分で止まったので、古いファイルを1本にまとめる。
 *
 *   ① GOKIGEN台帳フォルダ … CONFIG.consolidateBefore 以前の日次ファイルの全行を
 *      「GOKIGEN台帳_base」に統合し、元ファイルは「圧縮済み」フォルダへ移す
 *   ② Udemy台帳フォルダ  … 同じ名前のログが複数あるものを、中身が同じなら1本だけ残し、
 *      違えば全部の行をマージした「〜_統合」を作って元ファイルは「圧縮済み」へ移す
 *   ③ リミットレス・経済・未来ビジョンは数が少ないのでさわらない
 *
 * **ファイルは1つも削除しない。**「圧縮済み」フォルダに移すだけで、中身はいつでも見られる。
 * GASはフォルダの直下しか読まないので、移した時点で自動的に読み込み対象から外れる。
 * 何度実行しても壊れない（すでにある base も読み直してまとめ直す）。
 */
function runConsolidateOnce() {
  var t0 = new Date().getTime();
  var lines = ['🧹 台帳の整理をはじめます（削除はしません。「圧縮済み」フォルダへ移すだけです）'];
  lines.push(consolidateGokigen_());
  lines.push(consolidateUdemyDuplicates_());
  lines.push('⏱ 整理にかかった時間: ' + ((new Date().getTime() - t0) / 1000).toFixed(1) + '秒');
  lines.push('このあと runNow() を1回実行して、data.json が作り直せることを確かめてください。');
  var out = lines.join('\n');
  Logger.log(out);
  return out;
}

/** フォルダの中の「圧縮済み」サブフォルダ。無ければ作る */
function archiveFolder_(folder) {
  var it = folder.getFoldersByName(CONFIG.archiveFolderName);
  return it.hasNext() ? it.next() : folder.createFolder(CONFIG.archiveFolderName);
}
/** ファイルを別フォルダへ移す（削除はしない） */
function moveFile_(file, dest) {
  try { file.moveTo(dest); }
  catch (e) {                                  // 古い実行環境向けの言い換え
    dest.addFile(file);
    file.getParents().next().removeFile(file);
  }
}
/** ファイル名から台帳の日付（YYYY-MM-DD）を取り出す */
function nameDate_(name) {
  var m = String(name || '').match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
/** フォルダ直下から名前ちょうど一致のファイルを1つ返す */
function fileInFolder_(folder, name) {
  var it = folder.getFilesByName(name);
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;                              // v1.7.2：ゴミ箱のものは読まない
    if (f.getName() === name) return f;
  }
  return null;
}
/** 「=」で始まる文字列を数式と誤解されないようにする（読み戻すと元の文字列に戻る） */
function safeCell_(v) {
  if (v == null) return '';
  if (typeof v === 'string' && /^[=+@]/.test(v)) return "'" + v;
  return v;
}

// GOKIGEN台帳_base に書き出す列。readGokigen_ は位置で読むので、この並びを変えないこと。
var GOKIGEN_BASE_HEAD = ['日付', '曜日', '体重', '体脂肪率', '筋肉量', '内臓脂肪', '体年齢',
  '血圧上', '血圧下', 'ご機嫌度', '睡眠', '運動', '会食', 'ルーティン', '一言'];

function gokigenBaseRow_(r) {
  return [
    r.date, r.dow, r.weight, r.fat, r.muscle, r.visceral, r.bodyAge, r.bpHigh, r.bpLow,
    // ご機嫌度は5段階と10段階が混ざる。読み戻すときに取り違えないよう必ず「8/10」の形で書く
    r.mood == null ? '' : (r.mood + '/10'),
    r.sleep, r.exercise, r.dining, r.routine, r.note
  ].map(safeCell_);
}

function consolidateGokigen_() {
  var folder = DriveApp.getFolderById(CONFIG.gokigenFolderId);
  var cutoff = CONFIG.consolidateBefore;

  // 対象＝直下のスプレッドシートのうち、GOKIGEN台帳で、名前の日付が cutoff 以前のもの
  var targets = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;
    if (f.isTrashed()) continue;                              // v1.7.2：ゴミ箱のものは読まない
    var n = f.getName();
    if (n === CONFIG.gokigenBaseName) continue;
    if (!/^GOKIGEN[_ ]?台帳/.test(n)) continue;      // 関係ないファイルは絶対にさわらない
    var d = nameDate_(n);
    if (!d || d > cutoff) continue;
    targets.push({ file: f, name: n, t: f.getLastUpdated().getTime() });
  }
  var base = fileInFolder_(folder, CONFIG.gokigenBaseName);
  if (!targets.length) {
    return '① GOKIGEN台帳: ' + cutoff + ' 以前のまとめ対象はありませんでした' +
           (base ? '（baseはすでにあります）' : '');
  }
  targets.sort(function (a, b) { return a.t - b.t; });   // 古い順＝弱い順に読む

  // すでにある base を最初に読み、そのあと日次を古い順に重ねる（＝ふだんの読み方と同じ順番）
  var out = {};
  if (base) readGokigenInto_(base, out);
  targets.forEach(function (x) { readGokigenInto_(x.file, out); });
  var dates = Object.keys(out).sort();
  dates.forEach(function (d) { delete out[d]._ok; });
  if (!dates.length) return '① GOKIGEN台帳: 対象' + targets.length + '本から1行も読めなかったので、何も移しませんでした';

  // 書き出し（base が無ければ作ってフォルダへ入れる）
  var ss;
  if (base) { ss = SpreadsheetApp.openById(base.getId()); }
  else {
    ss = SpreadsheetApp.create(CONFIG.gokigenBaseName);
    moveFile_(DriveApp.getFileById(ss.getId()), folder);
  }
  var sheet = ss.getSheets()[0];
  sheet.clear();
  var values = [GOKIGEN_BASE_HEAD].concat(dates.map(function (d) { return gokigenBaseRow_(out[d]); }));
  sheet.getRange(1, 1, values.length, GOKIGEN_BASE_HEAD.length).setValues(values);
  SpreadsheetApp.flush();

  // 読めたことを確かめてから元ファイルを移す（ここで失敗したら1本も移さない）
  var check = {};
  readGokigenInto_(DriveApp.getFileById(ss.getId()), check);
  var checkDates = Object.keys(check);
  if (checkDates.length < dates.length) {
    throw new Error('まとめた base を読み直したら ' + checkDates.length + '日分しかありません（元は ' +
                    dates.length + '日分）。元ファイルはそのままにしました。');
  }

  var arch = archiveFolder_(folder);
  targets.forEach(function (x) { moveFile_(x.file, arch); });

  return '① GOKIGEN台帳: ' + targets.length + '本を「' + CONFIG.gokigenBaseName + '」に統合しました（' +
         dates[0] + '〜' + dates[dates.length - 1] + ' の' + dates.length + '日分）。' +
         '元の' + targets.length + '本は「' + CONFIG.archiveFolderName + '」へ移動（削除していません）';
}

/** 1ファイル分のGOKIGEN台帳を out（日付→レコード）に重ねる。readGokigen_ と同じ規則 */
function readGokigenInto_(file, out) {
  var values;
  try { values = SpreadsheetApp.openById(file.getId()).getSheets()[0].getDataRange().getValues(); }
  catch (e) { Logger.log('読めませんでした: ' + file.getName() + ' / ' + e); return; }
  var head = findHeader_(values, '日付');
  if (head < 0) return;
  for (var i = head + 1; i < values.length; i++) {
    var row = values[i];
    var date = toDate_(row[0]);
    if (!date) continue;
    var rec = {
      date: date,
      dow: String(row[1] || '').trim() || dowOf_(date),
      weight:   num_(row[2]),
      fat:      num_(row[3]),
      muscle:   num_(row[4]),
      visceral: num_(row[5]),
      bodyAge:  num_(row[6]),
      bpHigh:   num_(row[7]),
      bpLow:    num_(row[8]),
      mood:     mood_(row[9]),
      sleep:    num_(row[10]),
      exercise: str_(row[11]),
      dining:   str_(row[12]),
      routine:  num_(row[13]),
      note:     str_(row[14])
    };
    rec._ok = wellFormed_(row);
    out[date] = mergeRow_(out[date], rec);
  }
}

// 統合したUdemyログに書き出す列（名前で読むので並びは自由だが、分かりやすい順にしておく）
var UDEMY_MERGE_HEAD = ['記録日', '基準時刻', 'コースID', 'コース名', '公開年月',
  '累計登録', '月間登録', '累計収益USD', '評価', '施策メモ', '出所'];

function consolidateUdemyDuplicates_() {
  var folder = DriveApp.getFolderById(CONFIG.udemyFolderId);
  var byName = {};
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;
    var n = f.getName();
    if (n === CONFIG.udemyBaseName) continue;                       // 土台はさわらない
    if (!/^Udemy台帳ログ_\d{4}-\d{2}-\d{2}/.test(n)) continue;      // 対象は日々のログだけ
    (byName[n] = byName[n] || []).push({ file: f, t: f.getLastUpdated().getTime() });
  }
  var dupNames = Object.keys(byName).filter(function (n) { return byName[n].length > 1; }).sort();
  if (!dupNames.length) return '② Udemy台帳: 同じ名前のログの重複はありませんでした';

  var arch = archiveFolder_(folder);
  var report = [];
  dupNames.forEach(function (name) {
    var list = byName[name].sort(function (a, b) { return a.t - b.t; });   // 古い順＝弱い順
    var read = list.map(function (x) {
      var rows = [];
      try { rows = readLedgerSheet_(SpreadsheetApp.openById(x.file.getId()).getSheets()[0], name); }
      catch (e) { Logger.log('読めませんでした: ' + name + ' / ' + e); }
      return { x: x, rows: rows, sig: ledgerSignature_(rows) };
    });
    var same = read.every(function (r) { return r.sig === read[0].sig; });

    if (same) {
      // 中身が同じ → いちばん新しい1本だけ残して、残りを圧縮済みへ
      read.slice(0, -1).forEach(function (r) { moveFile_(r.x.file, arch); });
      report.push('　' + name + ': ' + list.length + '本とも中身が同じ → 1本残して' +
                  (list.length - 1) + '本を「' + CONFIG.archiveFolderName + '」へ');
      return;
    }
    // 中身が違う → 全行をマージして「〜_統合」を作り、元は全部圧縮済みへ
    var byKey = {};
    read.forEach(function (r) {
      r.rows.forEach(function (row) {
        var k = row.date + '|' + row.id;
        byKey[k] = mergeLedger_(byKey[k], row);
      });
    });
    var keys = Object.keys(byKey).sort();
    if (!keys.length) {
      report.push('　' + name + ': 中身が違いますが1行も読めなかったので、そのままにしました');
      return;
    }
    var ss = SpreadsheetApp.create(name + '_統合');
    var values = [UDEMY_MERGE_HEAD].concat(keys.map(function (k) {
      var r = byKey[k];
      return [r.date, r.time == null ? '' : "'" + r.time, r.id, r.name, r.published,
              r.cumEnroll, r.monthEnroll, r.cumRevenue, r.rating, r.note, r.src].map(safeCell_);
    }));
    ss.getSheets()[0].getRange(1, 1, values.length, UDEMY_MERGE_HEAD.length).setValues(values);
    SpreadsheetApp.flush();
    moveFile_(DriveApp.getFileById(ss.getId()), folder);
    read.forEach(function (r) { moveFile_(r.x.file, arch); });
    report.push('　' + name + ': ' + list.length + '本の中身が違ったので全部の行をマージ → 「' +
                name + '_統合」（' + keys.length + '行）を作り、元' + list.length +
                '本を「' + CONFIG.archiveFolderName + '」へ');
  });
  return '② Udemy台帳: 同じ名前のログが' + dupNames.length + '組ありました\n' + report.join('\n');
}

/** 台帳の中身が同じかどうかを見分けるための指紋 */
function ledgerSignature_(rows) {
  return JSON.stringify(rows.slice().sort(function (a, b) {
    return (a.date + '|' + a.id) < (b.date + '|' + b.id) ? -1 : 1;
  }).map(function (r) {
    return [r.date, r.id, r.cumEnroll, r.cumRevenue, r.rating, r.monthEnroll, r.note];
  }));
}

// 動作確認用：GitHubに書かず、中身だけログに出す
function dryRun() {
  var d = buildData_(fetchCurrentJson_());
  Logger.log('健康データ: ' + d.health.length + '日分 (' +
    d.health[0].date + ' 〜 ' + d.health[d.health.length - 1].date + ')');
  var w = d.health.filter(function (r) { return r.weight != null; });
  Logger.log('体重: ' + w.length + '点  ' + w[0].weight + 'kg → ' + w[w.length - 1].weight + 'kg');
  Logger.log('Udemyの読込元: ' + d.source.udemyFiles.map(function (u) {
    return u.name + '(' + u.rows + '行)'; }).join(' / '));
  Logger.log('Udemyスナップショット: ' + d.udemy.length + '件');
  if (d.udemy.length) {
    var s = d.udemy[d.udemy.length - 1];
    var tot = s.rows.reduce(function (a, r) { return a + (r.cumEnroll || 0); }, 0);
    Logger.log('   最新 ' + s.date + ' 累計登録 ' + tot + '人');
  }
  Logger.log('Udemy月次履歴: ' + (d.udemyMonthly.length ? d.udemyMonthly.length + 'ヶ月 (' +
    d.udemyMonthly[0].ym + ' 〜 ' + d.udemyMonthly[d.udemyMonthly.length - 1].ym + ')' : 'なし'));
  Logger.log('レンジ外で除外: ' + d.qualityDropped.length + '件');
  d.qualityDropped.forEach(function (x) {
    Logger.log('   ' + x.date + ' ' + x.field + ' = ' + x.value + ' (許容 ' + x.range + ')');
  });
  // v1.2の3つ
  Logger.log('未来ビジョン: ' + (d.future
    ? d.future.docTitle + '（はしご' + d.future.ladder.length + '段／部屋' +
      Object.keys(d.future.rooms).length + '／軸' + d.future.axes.length + '）'
    : '読めていません'));
  Logger.log('リミットレス: ' + d.limitless.rows.length + '行' +
    (d.limitless.rows.length ? '（' + d.limitless.rows[0].date + '〜' +
      d.limitless.rows[d.limitless.rows.length - 1].date + '）' : '') +
    ' 読込元: ' + d.limitless.used.map(function (u) { return u.name + '(' + u.rows + ')'; }).join(' / '));
  // v1.3の2つ
  if (d.knowledge) {
    var kw = d.knowledge;
    var fmt = function (c) {
      return kw.kinds.map(function (k) { return k + c[k]; }).join(' ');
    };
    Logger.log('知識（今週 ' + kw.week.from + '〜' + kw.week.to + '／' + kw.week.rows + '行）: ' + fmt(kw.week.counts));
    Logger.log('知識（今月 ' + kw.month.from + '〜' + kw.month.to + '／' + kw.month.rows + '行）: ' + fmt(kw.month.counts));
    Logger.log('　直近5行: ' + kw.recent.map(function (r) {
      return r.date + '[' + (r.kindsText || '') + ']'; }).join(' / '));
  }
  var wn = d.warnings || [];
  Logger.log('健全性: 警告' + wn.filter(function (w) { return w.level === 'warn'; }).length +
             '件 / 情報' + wn.filter(function (w) { return w.level === 'info'; }).length + '件');
  wn.forEach(function (w) { Logger.log('   [' + w.level + '] ' + w.text); });
  Logger.log('経済台帳: ' + d.eco.rows.length + '件' + (d.eco.asOf ? '（' + d.eco.asOf + '時点）' : '（データ待ち）') +
    ' 総資産の推移' + ((d.eco.history || []).length) + '点');
  // v1.4の3つ
  Logger.log('自己バージョン: ' + d.selfVersion.version + '（' + d.selfVersion.birth + '生まれ／' +
    d.selfVersion.asOf + '時点）');
  Logger.log('WANT台帳: ' + (d.want ? d.want.rows.length + '行（' + d.want.title + '）' : '読めていません'));
  (d.want ? d.want.rows : []).forEach(function (r) {
    Logger.log('   ' + r.room + ' / ' + r.item + ' → ' + r.goal + '  [' + (r.how || '') + ']');
  });
  // v1.6の2つ
  Logger.log('カレンダー（会食の枠）: ' + (d.calendar
    ? d.calendar.count + '件（' + d.calendar.from + '〜' + d.calendar.to + '）　予約' +
      d.calendar.events.filter(function (e) { return e.kind === 'booked'; }).length + '／空き' +
      d.calendar.events.filter(function (e) { return e.kind === 'open'; }).length
    : '読めていません（calendar.readonly の再承認がまだかもしれません）'));
  ((d.calendar && d.calendar.events) || []).forEach(function (e) {
    Logger.log('   ' + e.date + ' [' + e.kind + (e.cat ? '/' + e.cat : '') + '] ' + e.title);
  });
  Logger.log('note台帳: ' + (d.note && d.note.asOf
    ? d.note.asOf + '時点　月間' + ((d.note.month && d.note.month.views) || '—') + 'ビュー・' +
      ((d.note.month && d.note.month.likes) || '—') + 'スキ／全期間' +
      ((d.note.all && d.note.all.views) || '—') + 'ビュー'
    : 'まだありません'));
  Logger.log('行きたい場所台帳: ' + (d.places
    ? d.places.count + '件（' + d.places.title + '／' + d.places.asOf + '）' +
      (d.places.noGeo.length ? '　⚠️緯度経度なし ' + d.places.noGeo.length + '件' : '')
    : 'まだ読めていません'));
  Logger.log('低山台帳: ' + (d.mountains
    ? d.mountains.count + '座（' + d.mountains.title + '／目標' + d.mountains.goal + '座）'
    : 'まだ読めていません'));
  Logger.log('週報書棚: ' + (d.weekly
    ? d.weekly.count + '本' + (d.weekly.latest ? '／最新 ' + d.weekly.latest.name : '（まだ空）')
    : '見られていません'));
  Logger.log('📂リンク: ' + Object.keys(d.links).filter(function (k) { return k !== 'folders'; })
    .map(function (k) { return k + (d.links[k].url ? '✓' : '✗'); }).join(' '));
  return d;
}

/**
 * v1.2.1：どのフォルダの読み込みに何秒かかっているかをログに出す。
 * 6分の実行制限に当たったとき、どこが重いのかを推測ではなく数字で見るため。
 */
function timeIt_(label, fn) {
  var t0 = new Date().getTime();
  try {
    return fn();
  } finally {
    var sec = ((new Date().getTime() - t0) / 1000).toFixed(1);
    Logger.log('⏱ ' + label + ': ' + sec + '秒');
  }
}

// ===== データ構築 =====
function buildData_(previous) {
  var tAll = new Date().getTime();
  var health = timeIt_('GOKIGEN台帳', readGokigen_);

  var dates = Object.keys(health).sort();
  var dropped = [];
  var healthArr = dates.map(function (d) { return gate_(health[d], dropped); });

  // Udemyは「Udemy台帳_base の台帳ログ」＋「Udemy台帳ログ_YYYY-MM-DD（デルタ）」の合算
  var ledger = { rows: [], courses: [], used: [] };
  try {
    ledger = timeIt_('Udemy台帳', readUdemyLedger_);
  } catch (e) {
    Logger.log('⚠️ Udemy台帳を読めませんでした（前回の内容を維持します）: ' + e);
  }
  var u = buildUdemy_(ledger, previous);

  var base = findUdemyBase_();

  // v1.2：6部屋コックピットの材料。1つ失敗しても他を巻き込まないよう、それぞれtryで囲む
  var future = null, limitless = { rows: [], used: [] }, eco = { rows: [], used: [] };
  try { future = timeIt_('未来ビジョン台帳', readFuture_); }
  catch (e) { Logger.log('⚠️ 未来ビジョン台帳を読めませんでした（前回の内容を維持します）: ' + e); }
  if (!future) future = (previous && previous.future) || null;
  try { limitless = timeIt_('リミットレス台帳', readLimitless_); }
  catch (e) { Logger.log('⚠️ リミットレス台帳を読めませんでした（前回の内容を維持します）: ' + e);
              limitless = (previous && previous.limitless) || { rows: [], used: [] }; }
  try { eco = timeIt_('経済台帳', readEco_); }
  catch (e) { Logger.log('⚠️ 経済台帳を読めませんでした（前回の内容を維持します）: ' + e);
              eco = (previous && previous.eco) || { rows: [], used: [] }; }

  // v1.4：WANT台帳（目標）と週報書棚（リンクだけ）。
  // どちらも1つ失敗しても他を巻き込まない。読めなければ前回の内容をそのまま保つ。
  var want = null, weekly = null;
  try { want = timeIt_('WANT台帳', readWant_); }
  catch (e) { Logger.log('⚠️ WANT台帳を読めませんでした（前回の内容を維持します）: ' + e); }
  if (!want) want = (previous && previous.want) || null;
  try { weekly = timeIt_('週報書棚', readWeekly_); }
  catch (e) { Logger.log('⚠️ 週報書棚を見られませんでした（前回の内容を維持します）: ' + e);
              weekly = (previous && previous.weekly) || null; }

  var asOf = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  /* v1.6：会食の「枠と予約」（Googleカレンダー）と note台帳。
     どちらも1つ失敗しても他を巻き込まない。読めなければ前回の内容をそのまま保つ。
     ※ カレンダーは appsscript.json に calendar.readonly を足して**再承認**するまで
        権限エラーになる。そのときもここで受け止めるので、data.json は壊れない
        （アプリは「カレンダーがまだつながっていません」と出すだけ）。 */
  var calendar = null, note = null;
  try { calendar = timeIt_('Googleカレンダー', function () { return readCalendar_(asOf); }); }
  catch (e) { Logger.log('⚠️ カレンダーを読めませんでした（前回の内容を維持します）: ' + e); }
  if (!calendar) calendar = (previous && previous.calendar) || null;
  try { note = timeIt_('note台帳', readNote_); }
  catch (e) { Logger.log('⚠️ note台帳を読めませんでした（前回の内容を維持します）: ' + e); }
  if (!note || !note.asOf) note = (previous && previous.note) || note;

  // v1.7：行きたい場所台帳（表示専用。読めなければ前回の内容をそのまま保つ）
  var places = null;
  try { places = timeIt_('行きたい場所台帳', readPlaces_); }
  catch (e) { Logger.log('⚠️ 行きたい場所台帳を読めませんでした（前回の内容を維持します）: ' + e); }
  if (!places) places = (previous && previous.places) || null;

  // v1.7.1：低山台帳（⛰低山タブ）。こちらも表示専用
  var mountains = null;
  try { mountains = timeIt_('低山台帳', readMountains_); }
  catch (e) { Logger.log('⚠️ 低山台帳を読めませんでした（前回の内容を維持します）: ' + e); }
  if (!mountains) mountains = (previous && previous.mountains) || null;

  // v1.3：取込時の異常（累計の減少・日付異常・コース名不一致）を1本にまとめる
  var warnings = [];
  try { warnings = buildWarnings_(ledger, u.courses, asOf, u.monthly); }
  catch (e) { Logger.log('⚠️ 健全性チェックでエラー（先に進みます）: ' + e); }

  // v1.3：知識の部屋にそのまま出す形（今週＝日曜〜土曜／今月／直近5行）
  var knowledge = null;
  try { knowledge = buildKnowledge_(limitless, asOf); }
  catch (e) { Logger.log('⚠️ knowledgeを作れませんでした（前回の内容を維持します）: ' + e);
              knowledge = (previous && previous.knowledge) || null; }

  Logger.log('⏱ データ作成の合計: ' + ((new Date().getTime() - tAll) / 1000).toFixed(1) + '秒');

  return {
    generatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    version: '1.7.1',
    selfVersion: selfVersion_(asOf),
    /* 月次総括の器。中身は本人が月に一度ふり返って足していく想定で、
       いまは空のまま置いておく（アプリは0件でも壊れない）。 */
    monthlyReview: (previous && previous.monthlyReview) || [],
    source: {
      gokigenFolderId: CONFIG.gokigenFolderId,
      udemyFolderId: CONFIG.udemyFolderId,
      limitlessFolderId: CONFIG.limitlessFolderId,
      ecoFolderId: CONFIG.ecoFolderId,
      wantFileId: CONFIG.wantFileId,
      weeklyFolderId: CONFIG.weeklyFolderId,
      rule: '全ファイルを読み、重複したら新しいファイルを優先',
      udemyFiles: ledger.used,
      limitlessFiles: limitless.used,
      ecoFiles: eco.used,
      noteFiles: (note && note.used) || [],
      placesFileId: CONFIG.placesFileId,
      mtnFileId: CONFIG.mtnFileId
    },
    updateHours: CONFIG.updateHours,
    udemyBaseUrl: base ? base.getUrl() : ((previous && previous.udemyBaseUrl) || null),
    qualityDropped: dropped,
    health: healthArr,
    udemyCourses: u.courses,
    udemy: u.snapshots,
    udemyMonthly: u.monthly,
    warnings: warnings,
    future: future,
    limitless: limitless,
    knowledge: knowledge,
    eco: eco,
    want: want,
    weekly: weekly,
    // v1.6：会食の枠・予約（カレンダー）と note台帳。実績はこれまでどおり health[].dining
    calendar: calendar,
    note: note,
    // v1.7：行きたい場所マップ（places.html）の材料。却下の行はここに来ない
    places: places,
    // v1.7.1：低山100（山＋セット温泉）。同じ places.html の「⛰低山」タブ
    mountains: mountains,
    links: buildLinks_(base, limitless, eco, future, previous)
  };
}

/**
 * 6部屋の「📂詳細データを開く」の行き先。
 * 台帳が見つからなかった部屋は url が null になり、アプリ側は「準備中」と出す。
 */
function buildLinks_(udemyBase, limitless, eco, future, previous) {
  var gok = 'https://drive.google.com/drive/folders/' + CONFIG.gokigenFolderId;
  var prev = (previous && previous.links) || {};
  var keep = function (key, v) { return v || (prev[key] && prev[key].url) || null; };
  var fld = function (id) { return 'https://drive.google.com/drive/folders/' + id; };
  return {
    /* v1.4【3点セットの「🗄書棚を開く」】部屋ごとの台帳フォルダ。
       上の links.* は「そのものズバリのファイル」を開く（例: 仕事＝Udemy台帳_base）が、
       書棚は日々のログも見たいので、必ず**フォルダ**を開く。 */
    folders: {
      health: gok, priv: gok,
      know:   fld(CONFIG.limitlessFolderId), spirit: fld(CONFIG.limitlessFolderId),
      work:   fld(CONFIG.udemyFolderId),
      eco:    fld(CONFIG.ecoFolderId),
      weekly: fld(CONFIG.weeklyFolderId)
    },
    health: { label: 'GOKIGEN台帳フォルダ', url: gok },
    priv:   { label: 'GOKIGEN台帳フォルダ', url: gok },
    // 知識・精神は台帳フォルダごと開く（base だけでなく日々のログも見たいため）
    know:   { label: 'リミットレス台帳フォルダ',
              url: keep('know', (limitless && limitless.folderUrl) ||
                                'https://drive.google.com/drive/folders/' + CONFIG.limitlessFolderId) },
    spirit: { label: 'リミットレス台帳フォルダ',
              url: keep('spirit', (limitless && limitless.folderUrl) ||
                                  'https://drive.google.com/drive/folders/' + CONFIG.limitlessFolderId) },
    work:   { label: CONFIG.udemyBaseName,
              url: udemyBase ? udemyBase.getUrl() : ((previous && previous.udemyBaseUrl) || null) },
    eco:    { label: CONFIG.ecoBaseName, url: keep('eco', eco && eco.baseUrl) },
    future: { label: (future && future.docTitle) || CONFIG.futureDocPrefix,
              url: keep('future', future && future.docUrl) }
  };
}

// 妥当レンジの門番。範囲外は取り込まず、除外ログを残す。
function gate_(rec, dropped) {
  Object.keys(RANGE).forEach(function (k) {
    var v = rec[k];
    if (v == null) return;
    var lo = RANGE[k][0], hi = RANGE[k][1];
    if (typeof v !== 'number' || isNaN(v) || v < lo || v > hi) {
      dropped.push({ date: rec.date, field: k, value: v, range: lo + '〜' + hi });
      rec[k] = null;
    }
  });
  return rec;
}

/**
 * v1.7.2：「〜台帳_base」を **名前で** 探す。固定IDは名前で見つからないときの予備。
 *
 * なぜ名前を先に見るか：
 * 台帳をDrive上で作り直すと fileId が変わる。旧ファイルはゴミ箱に入るが、
 * **ゴミ箱のファイルは fileId でなら開けてしまう**ので、固定IDを先に見ていると
 * いつまでも古い台帳を読み続ける（2026-08-22に実際に起きた。行きたい場所71件・
 * 低山46座に作り直したのに、アプリは50件・45座のままだった）。
 * 名前で探して、ゴミ箱のものは必ず外す。これで作り直しても勝手に追従する。
 *
 * 同名が複数あったら「更新時刻がいちばん新しいもの」を採り、警告をログに残す。
 */
function ledgerByName_(name, fallbackId, folderId) {
  var hits = [];
  try {
    var it = DriveApp.getFolderById(folderId || CONFIG.gokigenFolderId).getFilesByName(name);
    while (it.hasNext()) {
      var f = it.next();
      if (f.isTrashed()) continue;              // ゴミ箱の同名ファイルは絶対に読まない
      if (f.getName() !== name) continue;       // 名前がぴたり一致するものだけ
      hits.push(f);
    }
  } catch (e) { Logger.log('台帳を名前で探せませんでした（' + name + '）: ' + e); }

  if (hits.length > 1) {
    hits.sort(function (a, b) { return b.getLastUpdated().getTime() - a.getLastUpdated().getTime(); });
    Logger.log('⚠️ 同名の台帳が ' + hits.length + ' 件、最新（更新時刻）を採用: ' + name +
               '（' + Utilities.formatDate(hits[0].getLastUpdated(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') + '）');
  }
  if (hits.length) return hits[0];

  // 名前で見つからないときだけ、コードに書いてある固定IDを予備として使う
  if (fallbackId) {
    try {
      var g = DriveApp.getFileById(fallbackId);
      if (g && !g.isTrashed()) {
        Logger.log('「' + name + '」は名前で見つからないので固定IDで開きました: ' + fallbackId);
        return g;
      }
      if (g) Logger.log('⚠️ 固定IDの「' + name + '」はゴミ箱にあります。読みません: ' + fallbackId);
    } catch (e) { Logger.log('固定IDでも開けませんでした（' + name + '）: ' + e); }
  }
  Logger.log('⚠️ 台帳が見つかりません: ' + name);
  return null;
}

/**
 * 古い順にファイルを返す（後から読んだもので上書き = 新しいファイル優先）。
 *
 * ・DriveApp の getFiles() は **そのフォルダの直下だけ** を返す。サブフォルダの中は見ない。
 *   v1.2.1でこの性質を利用して、まとめ終わった古い台帳を「圧縮済み」フォルダへ移し、
 *   読み込み対象から自然に外している（1件も削除していない）。
 * ・まとめ先の「GOKIGEN台帳_base」は、更新日時がいちばん新しくても **必ず最初に読む**。
 *   そうしないと「新しいファイル優先」の順番がひっくり返り、まとめる前と結果が変わってしまう。
 */
function filesOldestFirst_(folderId, baseName) {
  var it = DriveApp.getFolderById(folderId).getFiles();   // 直下のみ（サブフォルダは対象外）
  var list = [];
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType() !== MimeType.GOOGLE_SHEETS) continue; // スプレッドシート以外は無視
    if (f.isTrashed()) continue;                              // v1.7.2：ゴミ箱のものは読まない
    var rank = (baseName && f.getName() === baseName) ? 0 : 1;
    list.push({ file: f, rank: rank, t: f.getLastUpdated().getTime() });
  }
  list.sort(function (a, b) { return (a.rank - b.rank) || (a.t - b.t); });
  return list.map(function (x) { return x.file; });
}

// ===== GOKIGEN台帳 =====
function readGokigen_() {
  var out = {}, n = 0;
  filesOldestFirst_(CONFIG.gokigenFolderId, CONFIG.gokigenBaseName).forEach(function (file) {
    readGokigenInto_(file, out);            // 1ファイルぶんを重ねる（統合処理と同じ規則）
    n++;
  });
  // 内部フラグを外す
  Object.keys(out).forEach(function (d) { delete out[d]._ok; });
  Logger.log('GOKIGEN台帳: ' + n + 'ファイル → ' + Object.keys(out).length + '日分');
  return out;
}

var HEALTH_FIELDS = ['weight','fat','muscle','visceral','bodyAge','bpHigh','bpLow',
                     'mood','sleep','exercise','dining','routine','note'];

/**
 * 列がズレている行を見分ける。
 * 古い台帳には、空欄が詰められて値が左にズレた行が混ざっている
 * （例: 血圧上に「6」、血圧下に長文、体重に「4/5」）。
 * そういう行は、まともな行を上書きしてはいけない。
 */
function wellFormed_(row) {
  var w = row[2];
  if (!blank_(w)) {
    if (w instanceof Date) return false;                       // 体重が日付として解釈されている
    if (num_(w) == null) return false;                         // 体重が数値でない
    if (typeof w === 'string' && /\//.test(w)) return false;    // 体重欄に「4/5」など
  }
  if (!blank_(row[3])) { var f = num_(row[3]); if (f == null || f < 3  || f > 60)  return false; } // 体脂肪率
  if (!blank_(row[7])) { var h = num_(row[7]); if (h == null || h < 70 || h > 250) return false; } // 血圧上
  if (!blank_(row[8])) { var l = num_(row[8]); if (l == null || l < 30 || l > 150) return false; } // 血圧下
  // ご機嫌度は5段階と10段階が混在するので、10までは正当な記録。
  // 睡眠スコアが空なのに機嫌が10を超えているときだけ、列がズレていると判断する。
  if (!blank_(row[9]) && !(row[9] instanceof Date) && blank_(row[10])) {
    var m = num_(row[9]); if (m != null && m > 10) return false;                                   // ご機嫌度
  }
  if (!blank_(row[10])) { var s = num_(row[10]); if (s == null || s < 0 || s > 100) return false; } // 睡眠スコア
  return true;
}
function blank_(v) { return v === '' || v === null || v === undefined; }

/**
 * 同じ日付の行が複数の台帳にある場合の統合。
 *   - 列が正しい行を優先する（ズレた行で上書きしない）
 *   - 同じ条件なら新しいファイルを優先する
 *   - 勝った行の空欄は、もう一方が正しい行のときだけ埋める
 */
function mergeRow_(prev, next) {
  if (!prev) return next;
  var winner, loser;
  if (prev._ok !== next._ok) { winner = prev._ok ? prev : next; loser = prev._ok ? next : prev; }
  else { winner = next; loser = prev; }   // 同格なら新しい方（読む順が古い→新しい）
  if (loser._ok) {
    HEALTH_FIELDS.forEach(function (f) {
      if (winner[f] == null && loser[f] != null) winner[f] = loser[f];
    });
  }
  return winner;
}

// ===== Udemy台帳（base + デルタの合算） =====
/**
 * 読む先は Udemy台帳フォルダの中の3種類。弱い順に：
 *   ① Udemy台帳_base の「台帳ログ」        … 2021年からの土台（いちばん弱い）
 *   ② Udemy台帳_YYYY-MM-DD                 … 旧方式のスナップショット（過渡期の互換のため残す）
 *   ③ Udemy台帳ログ_YYYY-MM-DD             … 月次スクショから作るデルタ（いちばん強い）
 * 同じ「記録日 × コースID」が複数にあれば、強い方＝新しいファイルを優先する。
 */
var LEDGER_RANK = { base: 0, legacy: 1, delta: 2 };

// 列は名前で拾う（ファイルによって列数も並びも違うため）
var LEDGER_COLS = {
  date:        ['記録日', '日付'],
  time:        ['基準時刻', '時刻'],
  id:          ['コースID', 'ID'],
  name:        ['コース名', '講座名'],
  published:   ['公開年月', '公開月'],
  cumEnroll:   ['累計登録', '累計登録者', '累計受講生'],
  monthEnroll: ['月間登録'],
  cumRevenue:  ['累計収益', '収益'],  // 「累計収益(USD)」「累計収益USD」も正規化すると同じになる
  rating:      ['評価'],
  note:        ['施策メモ', '施策', 'メモ'],
  src:         ['出所']
};
/* v1.3：デルタ（Udemy台帳ログ_YYYY-MM-DD）に「評価」「収益」「施策メモ」が入るようになった。
   ただし列が無い月も必ずある。列が無ければ hd.map にキーが入らず、cell() が null を返し、
   その項目だけ空になって残りはこれまでどおり動く（＝あっても無くても壊れない）。 */

/* v1.5【要件1】コースIDは C01〜C10 だけを取り込む（ホワイトリスト制）。
   台帳に「全体」「合計」のような集計行が1行でも混ざると、それが11本目のコースとして
   数えられ、累計登録も月間新規も丸ごと二重計上になる。知らないIDは黙って捨てず、
   必ず「未知のコースIDをスキップ」の警告として残す（＝気づけるようにする）。 */
var UDEMY_COURSE_IDS = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10'];
function isUdemyCourseId_(id) {
  return UDEMY_COURSE_IDS.indexOf(String(id == null ? '' : id).trim().toUpperCase()) >= 0;
}

// 見出しのゆらぎを吸収する（空白・かっこ・USD を落とす）
function normHead_(v) {
  return String(v == null ? '' : v).replace(/[\s　()（）]/g, '').replace(/USD/gi, '').trim();
}

// 見出し行を探して、項目名 → 列番号 の対応表を作る
function findLedgerHeader_(values) {
  for (var i = 0; i < Math.min(values.length, 10); i++) {
    var norm = values[i].map(normHead_);
    if (norm.indexOf('記録日') < 0) continue;
    var map = {};
    Object.keys(LEDGER_COLS).forEach(function (field) {
      LEDGER_COLS[field].forEach(function (label) {
        if (map[field] != null) return;
        var c = norm.indexOf(normHead_(label));
        if (c >= 0) map[field] = c;
      });
    });
    return { row: i, map: map };
  }
  return null;
}

function readLedgerSheet_(sheet, srcName) {
  var values = sheet.getDataRange().getValues();
  var hd = findLedgerHeader_(values);
  if (!hd) return [];
  var tz = sheetTimeZone_(sheet);   // 時刻セルは、このシートのタイムゾーンで書き戻す
  var out = [];
  for (var i = hd.row + 1; i < values.length; i++) {
    var row = values[i];
    var cell = function (f) { var c = hd.map[f]; return c == null ? null : row[c]; };
    var date = toDate_(cell('date')), id = str_(cell('id'));
    if (!date || !id) continue;
    out.push({
      date:        date,
      time:        timeStr_(cell('time'), tz),
      id:          id,
      name:        str_(cell('name')),
      published:   ymStr_(cell('published')),
      cumEnroll:   num_(cell('cumEnroll')),
      monthEnroll: num_(cell('monthEnroll')),
      cumRevenue:  money_(cell('cumRevenue')),
      rating:      num_(cell('rating')),
      note:        str_(cell('note')),      // 施策メモ（無い月は null）
      src:         str_(cell('src')) || srcName
    });
  }
  return out;
}

// フォルダの中から読むべきファイルを、弱い順に並べて返す
function udemySources_() {
  var out = [];
  var it = DriveApp.getFolderById(CONFIG.udemyFolderId).getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;
    if (f.isTrashed()) continue;                              // v1.7.2：ゴミ箱のものは読まない
    var n = f.getName(), rank = null;
    if (n === CONFIG.udemyBaseName)                       rank = LEDGER_RANK.base;
    else if (/^Udemy台帳ログ_\d{4}-\d{2}-\d{2}/.test(n))  rank = LEDGER_RANK.delta;
    else if (/^Udemy台帳_\d{4}-\d{2}-\d{2}/.test(n))      rank = LEDGER_RANK.legacy;
    if (rank == null) continue;
    out.push({ file: f, name: n, rank: rank, t: f.getLastUpdated().getTime() });
  }
  out.sort(function (a, b) { return (a.rank - b.rank) || (a.t - b.t); });
  return out;
}

function readUdemyLedger_() {
  var byKey = {}, courses = [], used = [], skipped = {};
  udemySources_().forEach(function (s) {
    var ss;
    try { ss = SpreadsheetApp.openById(s.file.getId()); }
    catch (e) { Logger.log('読めませんでした: ' + s.name + ' / ' + e); return; }

    // base は「台帳ログ」シート。デルタ／旧スナップショットは1枚目。
    var sheet = (s.rank === LEDGER_RANK.base) ? ss.getSheetByName('台帳ログ') : ss.getSheets()[0];
    if (!sheet) { Logger.log('「台帳ログ」シートがありません: ' + s.name); return; }

    var all = readLedgerSheet_(sheet, s.name);
    // v1.5【要件1】C01〜C10 以外は取り込まない。落とした行はファイル・ID ごとに数えておく。
    var rows = all.filter(function (r) {
      if (isUdemyCourseId_(r.id)) return true;
      var k = r.id + '|' + s.name;
      if (!skipped[k]) skipped[k] = { id: r.id, src: s.name, n: 0 };
      skipped[k].n++;
      return false;
    });
    rows.forEach(function (r) {
      var k = r.date + '|' + r.id;
      byKey[k] = mergeLedger_(byKey[k], r);
    });
    used.push({ name: s.name, rows: rows.length });

    if (s.rank === LEDGER_RANK.base) {
      var mst = ss.getSheetByName('コースマスタ');
      if (mst) {
        mst.getDataRange().getValues().slice(1).forEach(function (r) {
          var id = str_(r[0]);
          if (!id) return;
          // コースマスタ側に「全体」行があっても、そこから11本目のコースを作らない
          if (!isUdemyCourseId_(id)) {
            var mk = id + '|' + s.name + '（コースマスタ）';
            if (!skipped[mk]) skipped[mk] = { id: id, src: s.name + ' のコースマスタ', n: 0 };
            skipped[mk].n++;
            return;
          }
          courses.push({ id: id, short: str_(r[1]), published: ymStr_(r[3]), title: str_(r[4]) });
        });
      }
    }
  });
  var rows = Object.keys(byKey).sort().map(function (k) { return byKey[k]; });
  var skips = Object.keys(skipped).sort().map(function (k) { return skipped[k]; });
  skips.forEach(function (x) {
    Logger.log('⚠️ 未知のコースIDをスキップ: ' + x.id + '（' + x.src + ' / ' + x.n + '行）');
  });
  return { rows: rows, courses: courses, used: used, skipped: skips };
}

// 同じ記録日×コースIDがぶつかったとき。強い（後から読んだ）方を採用し、空欄だけ弱い方で埋める。
function mergeLedger_(prev, next) {
  if (!prev) return next;
  ['time','name','published','cumEnroll','monthEnroll','cumRevenue','rating','note','src'].forEach(function (f) {
    if (next[f] == null && prev[f] != null) next[f] = prev[f];
  });
  return next;
}

/**
 * 合算した台帳から、アプリが使う形を作る。
 *   snapshots … 記録日ごとの全コース（前回比の表用。直近 snapshotLimit 日分だけ残す）
 *   monthly   … 月次の累計（グラフ用。その月に記録が無いコースは前月の値を持ち越す）
 *   courses   … コース一覧
 */
function buildUdemy_(ledger, previous) {
  var rows = ledger.rows;
  if (!rows.length) {
    return {
      snapshots: (previous && previous.udemy) || [],
      monthly:   (previous && previous.udemyMonthly) || [],
      courses:   (previous && previous.udemyCourses) || []
    };
  }

  var anomalies = checkCumulative_(rows);
  if (anomalies.length) {
    Logger.log('⚠️ 累計登録が減っている箇所があります（コースIDの取り違えを疑ってください）: ' +
               anomalies.join(' / '));
  }

  var byDate = {};
  rows.forEach(function (r) { (byDate[r.date] = byDate[r.date] || []).push(r); });
  var dates = Object.keys(byDate).sort();

  // コース一覧：コースマスタを正とし、無ければ前回の内容を引き継ぐ
  var courses = ledger.courses.slice();
  if (!courses.length && previous && previous.udemyCourses) courses = previous.udemyCourses.slice();

  // 一覧に載っていないコースが台帳にあれば補う。
  // ここを漏らすと、そのコースが月次の合計から丸ごと抜け落ちる。
  var known = {};
  courses.forEach(function (c) { known[c.id] = 1; });
  var extra = {};
  rows.forEach(function (r) { if (!known[r.id]) extra[r.id] = r; });   // 同じIDなら新しい行が残る
  Object.keys(extra).sort().forEach(function (id) {
    courses.push({ id: id, short: shortName_(extra[id].name) || id, published: extra[id].published || null });
  });
  /* 発売月は base の「公開年月」を正とする。書かれていないコースは、
     台帳にいちばん最初に現れた月を発売月とみなす（③新作の立ち上がりで使う）。 */
  var firstYm = {};
  rows.forEach(function (r) {
    var ym = r.date.slice(0, 7);
    if (!firstYm[r.id] || ym < firstYm[r.id]) firstYm[r.id] = ym;
  });
  courses.forEach(function (c) { if (firstYm[c.id]) c.firstYm = firstYm[c.id]; });

  var ids = courses.map(function (c) { return c.id; });

  // スナップショット（直近だけ。全部入れるとdata.jsonが肥大するため）
  var snapshots = dates.slice(-CONFIG.snapshotLimit).map(function (d) {
    var list = byDate[d].slice().sort(byId_);
    return {
      date: d,
      time: (list[0] && list[0].time) || null,
      rows: list.map(function (r) {
        var o = { id: r.id, cumEnroll: r.cumEnroll, monthEnroll: r.monthEnroll,
                  cumRevenue: r.cumRevenue, rating: r.rating };
        if (r.note) o.note = r.note;      // 施策メモ。書かれた日だけ入れる（無駄に膨らませない）
        return o;
      })
    };
  });

  // 月次：その月の最後の値を残し、記録の無い月は前月から持ち越す
  var byMonth = {};
  rows.forEach(function (r) {
    var ym = r.date.slice(0, 7);
    if (!byMonth[ym]) byMonth[ym] = {};
    if (!byMonth[ym][r.id]) byMonth[ym][r.id] = {};
    if (r.cumEnroll  != null) byMonth[ym][r.id].e = r.cumEnroll;
    if (r.cumRevenue != null) byMonth[ym][r.id].r = r.cumRevenue;
  });
  // その月に実際に記録があった日。月間新規が「いつからいつまでを測ったものか」を示すのに使う。
  var monthDays = {};
  rows.forEach(function (r) { (monthDays[r.date.slice(0, 7)] = monthDays[r.date.slice(0, 7)] || {})[r.date] = 1; });

  /* v1.5：Udemyの画面がそのまま出している「月間登録」列を、累計の引き算とは別に持つ。
     その月でいちばん新しい、列が埋まっている記録日の全コース合計をそのまま使う。
     累計の引き算（newEnroll）は前月の最後の記録が基準なので、7月の記録が7/17で
     止まっていると窓が32日間に広がる。officialNew はUdemy自身の「その月の実測」。
     列が無い月（〜2026/06）は null になるだけで、これまでの表示は変わらない。 */
  var officialByYm = {};
  (function () {
    var byDate = {};
    rows.forEach(function (r) {
      if (r.monthEnroll == null) return;
      byDate[r.date] = (byDate[r.date] || 0) + r.monthEnroll;
    });
    Object.keys(byDate).sort().forEach(function (d) {
      if (byDate[d] > 0) officialByYm[d.slice(0, 7)] = { date: d, n: Math.round(byDate[d]) };
    });
  })();

  var yms = Object.keys(byMonth).sort();
  var allIds = ids.length ? ids : uniqueIds_(byMonth);
  var cur = {}, monthly = [], prevCum = null, prevAnchor = null;
  allIds.forEach(function (id) { cur[id] = { e: null, r: null }; });
  eachMonth_(yms[0], yms[yms.length - 1]).forEach(function (ym) {
    allIds.forEach(function (id) {
      var v = byMonth[ym] && byMonth[ym][id];
      if (v) { if (v.e != null) cur[id].e = v.e; if (v.r != null) cur[id].r = v.r; }
    });
    var te = 0, tr = 0, byCourse = {};
    allIds.forEach(function (id) {
      if (cur[id].e != null) te += cur[id].e;
      if (cur[id].r != null) tr += cur[id].r;
      byCourse[id] = { enroll: cur[id].e, revenue: cur[id].r == null ? null : round2_(cur[id].r) };
    });

    /* 月間新規登録は、この1つの方法だけで出す：
         コースごとに「その月の最後の記録の累計登録」−「前月の最後の記録の累計登録」を求め、全コース合算する。
       日々の増分の積み上げや、台帳の「月間登録」列は使わない（二重計上のもとになるため）。 */
    var newEnroll = null;
    if (prevCum) {
      newEnroll = 0;
      allIds.forEach(function (id) {
        var a = prevCum[id], b = cur[id].e;
        // 新しく公開したコースは前月の値が無い。その場合は0からの増加として数える。
        if (b != null) newEnroll += (b - (a == null ? 0 : a));
      });
      newEnroll = Math.round(newEnroll);
    }

    // 台帳に記録の無い月があると、この差は1ヶ月ぶんではなくなる。
    // 実際に測った区間（from〜to）を持たせて、表示側が誤解しないようにする。
    var days = monthDays[ym] ? Object.keys(monthDays[ym]).sort() : [];
    var off = officialByYm[ym] || null;
    monthly.push({
      ym: ym, enroll: Math.round(te), newEnroll: newEnroll, revenue: round2_(tr),
      officialNew: off ? off.n : null,          // 台帳の「月間登録」列の合計（Udemyの実測）
      officialAsOf: off ? off.date : null,
      from: prevAnchor, to: days.length ? days[days.length - 1] : prevAnchor,
      records: days.length, byCourse: byCourse
    });

    var snap = {};
    allIds.forEach(function (id) { snap[id] = cur[id].e; });
    prevCum = snap;
    if (days.length) prevAnchor = days[days.length - 1];
  });

  // 土台（Udemy台帳_base）がまだ無い／読めないときに、2021年からのカーブを失わないための保険。
  // 台帳から作れた最初の月より前は、いま公開中の data.json の月次をそのまま引き継ぐ。
  var prevMonthly = (previous && previous.udemyMonthly) || [];
  if (monthly.length && prevMonthly.length) {
    var firstYm = monthly[0].ym;
    var head = prevMonthly.filter(function (m) { return m.ym < firstYm; });
    if (head.length) {
      Logger.log('月次の ' + head[0].ym + '〜' + head[head.length - 1].ym +
                 ' は前回のdata.jsonから引き継ぎました（台帳は ' + firstYm + ' から）');
      monthly = head.concat(monthly);
    }
  }

  return { snapshots: snapshots, monthly: monthly, courses: courses };
}
function byId_(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }

/**
 * 累計登録は減らないはず。減っていたら、baseとデルタでコースID（C01〜C10）の割当が
 * ズレているか、列を読み違えている。数字が静かに混ざるので必ず気づけるようにする。
 * ※2026-08-12時点では、Udemy台帳_baseのコースマスタもデルタも
 *   C01=組織適応の教科書 … C10=開くリーダー で一致していることを確認済み。
 */
function checkCumulative_(rows) {
  var seen = {}, bad = [];
  rows.forEach(function (r) {
    if (r.cumEnroll == null) return;
    var p = seen[r.id];
    if (p && r.cumEnroll < p.v) {
      bad.push(r.id + ': ' + p.d + ' ' + p.v + '人 → ' + r.date + ' ' + r.cumEnroll + '人');
    }
    if (!p || r.date >= p.d) seen[r.id] = { d: r.date, v: r.cumEnroll };
  });
  return bad;
}
/**
 * v1.3【健全性】取り込みのときに見つけた異常を1本の配列にまとめる。
 * アプリはこれを仕事タブの先頭に「⚠️バッジ」として出す（タップで中身が開く）。
 *
 * 2段階に分ける：
 *   warn（警告）… 数字が信用できない可能性があるもの。IDの取り違え・大きな逆行・名前の食い違い・未来日付
 *   info（情報）… 起きても不思議ではない小さな揺らぎ。C04の返金のような数人・数ドルの目減りなど
 * 判断に迷う「小さな負のデルタ」を警告にすると、毎日⚠️が出て誰も見なくなるため分けている。
 */
var WARN_ENROLL_BIG = 10;      // 累計登録がこの人数以上減ったら「警告」
var WARN_REVENUE_BIG = 50;     // 累計収益がこのドル以上減ったら「警告」
var WARN_STALE_DAYS = 3;       // 台帳が何日止まったら知らせるか（7日以上で「警告」）
var WARN_LIMIT = 20;           // data.jsonに残す件数の上限

/* v1.5【要件3】月間サニティ。月の新規登録がこの人数を超えたら「二重計上疑い」。
   過去には正当にこの人数を超えた月があるので、見るのは「いま取り込んでいる最新の月」だけ。

   v1.6（2026-08-22 本人決定）で 1,500 → 1,800 に引き上げた。
   2026年8月の実測が1,500人前後まで伸びており、**正当に増えた月**で毎回⚠️が出ると
   「またこの警告か」と読まれなくなる。1,800は本人の肌感の上限（これを超えたら
   さすがに同じ台帳が二重に入っている、という線）。数字を上げただけで判定の仕組みは同じ。 */
var WARN_MONTH_NEW = 1800;

function buildWarnings_(ledger, courses, asOf, monthly) {
  var rows = (ledger && ledger.rows) || [];
  var out = [];
  var label = {};
  (courses || []).forEach(function (c) { label[c.id] = (c.id + ' ' + (c.short || '')).trim(); });
  var nameOf = function (id) { return label[id] || id; };
  var add = function (level, kind, course, date, text) {
    out.push({ level: level, kind: kind, course: course || null, date: date || null, text: text });
  };

  // ① 累計の減少（累計は減らないはず）
  var seen = {};
  rows.forEach(function (r) {
    var p = seen[r.id];
    if (p) {
      if (r.cumEnroll != null && p.e != null && r.cumEnroll < p.e) {
        var de = p.e - r.cumEnroll;
        add(de >= WARN_ENROLL_BIG ? 'warn' : 'info', 'enrollDrop', r.id, r.date,
          nameOf(r.id) + 'の累計登録が ' + p.d + ' の ' + p.e + '人 → ' + r.date + ' の ' +
          r.cumEnroll + '人 と' + de + '人減っています' +
          (de >= WARN_ENROLL_BIG ? '（コースIDの取り違え・列の読み違えを疑ってください）'
                                 : '（返金などの小さな揺らぎとみられます）'));
      }
      if (r.cumRevenue != null && p.r != null && r.cumRevenue < p.r - 0.005) {
        var dr = round2_(p.r - r.cumRevenue);
        add(dr >= WARN_REVENUE_BIG ? 'warn' : 'info', 'revenueDrop', r.id, r.date,
          nameOf(r.id) + 'の累計収益が ' + p.d + ' の $' + round2_(p.r) + ' → ' + r.date + ' の $' +
          round2_(r.cumRevenue) + ' と $' + dr + ' 減っています' +
          (dr >= WARN_REVENUE_BIG ? '（列の読み違えを疑ってください）' : '（返金とみられます）'));
      }
    }
    if (!p || r.date >= p.d) {
      seen[r.id] = { d: r.date,
                     e: r.cumEnroll != null ? r.cumEnroll : (p ? p.e : null),
                     r: r.cumRevenue != null ? r.cumRevenue : (p ? p.r : null) };
    }
  });

  // ② 日付の異常
  var dates = rows.map(function (r) { return r.date; }).sort();
  if (dates.length) {
    var latest = dates[dates.length - 1];
    if (latest > asOf) {
      add('warn', 'futureDate', null, latest,
        '台帳に未来の日付（' + latest + '）の記録があります。記録日の書き間違いを疑ってください');
    } else {
      var stale = Math.round((new Date(asOf + 'T00:00:00Z') - new Date(latest + 'T00:00:00Z')) / 86400000);
      if (stale >= WARN_STALE_DAYS) {
        add(stale >= 7 ? 'warn' : 'info', 'stale', null, latest,
          'Udemy台帳が' + stale + '日更新されていません（最新の記録は ' + latest + '）');
      }
    }
  }

  /* ③ コース名の食い違いチェックは廃止した（2026-08-18 本人決定）。
     デルタ（毎日のログ）は同じ講座でも書き方がその日ごとに違う。
       base   【耳から学ぶビジネストレンド】人生100年時代。リスキリングなくして生き残れない。…
       デルタ 【耳から学ぶ】人生100年時代のリスキリング
     「真ん中を省いた書き方」を頭8文字の一致で救う作りにしていたが、
     省き方が頭から始まる講座（C04・C08）で誤検知が残り、直しても別の書き方でまた出る。
     **コースIDが一致していれば、名前の表記揺れは警告しない。**

     IDの取り違えそのものは、これで見逃さない：
       ・累計登録が減る  → ①の enrollDrop（10人以上の逆行は「警告」）
       ・累計収益が減る  → ①の revenueDrop（$50以上の逆行は「警告」）
     講座を入れ替えれば累計が必ず大きく逆行するので、そちらで確実に引っかかる。 */

  // ④ v1.5【要件1】ホワイトリストから外れたコースID（「全体」などの集計行）
  ((ledger && ledger.skipped) || []).forEach(function (x) {
    add('warn', 'unknownCourseId', null, null,
      '未知のコースID「' + x.id + '」の' + x.n + '行を取り込みませんでした（' + x.src +
      '）。コースIDは C01〜C10 だけです。「全体」などの集計行が混ざると二重計上になります');
  });

  /* ⑤ v1.5【要件3】月間サニティ。いま取り込んでいる最新の月だけを見る。
     台帳に「月間登録」列があればそれ（＝Udemyの実測）を、無ければ累計の差を使う。 */
  var lastM = (monthly || [])[(monthly || []).length - 1];
  if (lastM) {
    var mn = lastM.officialNew != null ? lastM.officialNew : lastM.newEnroll;
    var how = lastM.officialNew != null ? '台帳の「月間登録」列' :
              ('累計の差／' + (lastM.from || '?') + '〜' + (lastM.to || '?'));
    if (mn != null && mn > WARN_MONTH_NEW) {
      add('warn', 'monthSanity', null, lastM.to || null,
        lastM.ym + 'の月間新規登録が' + mn + '人（' + how + '）で、目安の' + WARN_MONTH_NEW +
        '人を超えています。同じ月の台帳ファイルが二重に入っていないか確かめてください');
    }
  }

  // 警告を先に、新しい日付から。多すぎるときは切って、切ったことも伝える
  out.sort(function (a, b) {
    if (a.level !== b.level) return a.level === 'warn' ? -1 : 1;
    return (b.date || '') < (a.date || '') ? -1 : 1;
  });
  var total = out.length;
  if (total > WARN_LIMIT) {
    out = out.slice(0, WARN_LIMIT);
    out.push({ level: 'info', kind: 'truncated', course: null, date: null,
               text: 'ほかにも ' + (total - WARN_LIMIT) + '件（古いものは省きました）' });
  }
  Logger.log('健全性チェック: 警告' + out.filter(function (w) { return w.level === 'warn'; }).length +
             '件 / 情報' + out.filter(function (w) { return w.level === 'info'; }).length + '件');
  return out;
}
function uniqueIds_(byMonth) {
  var s = {};
  Object.keys(byMonth).forEach(function (ym) { Object.keys(byMonth[ym]).forEach(function (id) { s[id] = 1; }); });
  return Object.keys(s).sort();
}
function eachMonth_(a, b) {
  var y = parseInt(a.slice(0, 4), 10), m = parseInt(a.slice(5, 7), 10), out = [];
  while (true) {
    var ym = y + '-' + ('0' + m).slice(-2);
    out.push(ym);
    if (ym >= b) break;
    m++; if (m === 13) { y++; m = 1; }
  }
  return out;
}
function round2_(n) { return Math.round(n * 100) / 100; }

// 今公開中の data.json を取得（フォールバックと差分判定に使う）
function fetchCurrentJson_() {
  try {
    var url = 'https://raw.githubusercontent.com/' + CONFIG.repoOwner + '/' + CONFIG.repoName +
              '/' + CONFIG.branch + '/' + CONFIG.filePath;
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    return JSON.parse(res.getContentText());
  } catch (e) { return null; }
}

// ===== v1.2: 未来ビジョン台帳（Googleドキュメント） =====
/**
 * GOKIGEN台帳フォルダの中の「未来ビジョン台帳_YYYY-MM-DD」を読み、
 *   rooms  … 6部屋それぞれの87歳の完成図（見出し＋箇条書き）
 *   ladder … 87→77→72→67→62歳のサブゴール
 *   axes   … 87歳が採点する5つの軸
 * にほぐす。半年ごとに本人が「重ね塗り」する台帳なので、
 * 新しい版が置かれたら自動でそちらを読む（ファイル名の日付が新しい方）。
 * 見出しの形が変わって1件も拾えなかったときは null を返し、呼び出し側が前回の内容を保つ。
 */
function findFutureDoc_() {
  var it = DriveApp.getFolderById(CONFIG.gokigenFolderId).getFiles();
  var best = null;
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType() !== MimeType.GOOGLE_DOCS) continue;
    if (f.isTrashed()) continue;                              // v1.7.2：ゴミ箱のものは読まない
    if (f.getName().indexOf(CONFIG.futureDocPrefix) !== 0) continue;
    if (!best || f.getName() > best.getName()) best = f;    // 名前の日付が新しい方
  }
  return best;
}
function futureSection_(t) {
  if (/完成図/.test(t)) return 'rooms';
  if (/サブゴール|はしご|バックキャスト/.test(t)) return 'ladder';
  if (/週報|フィードバック/.test(t)) return 'weekly';
  return null;
}
function futureRoom_(t) {
  if (/健康/.test(t)) return 'health';
  if (/精神|心/.test(t)) return 'spirit';
  if (/知識|教養/.test(t)) return 'know';
  if (/仕事/.test(t)) return 'work';
  if (/家族|趣味/.test(t)) return 'priv';
  if (/経済/.test(t)) return 'eco';
  return null;
}
/**
 * ドキュメントの中身を「ただの文章」として取り出す。
 *
 * DocumentApp.openById は documents スコープが要る。このスクリプトは drive と
 * external_request しか持っておらず、スコープを増やすと本人に再承認を求めることになるので使わない。
 * 代わりに Drive の書き出し（export）を、いまのスコープのまま UrlFetch で叩く。
 */
function fetchDocText_(fileId) {
  var url = 'https://www.googleapis.com/drive/v3/files/' + fileId +
            '/export?mimeType=text/plain&supportsAllDrives=true';
  var res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('ドキュメントを書き出せませんでした: ' + res.getResponseCode() + ' ' +
                    res.getContentText().slice(0, 200));
  }
  return res.getContentText();
}

/** 行頭の箇条書き記号・見出し記号・空白を落とす（書き出し方が変わっても拾えるように） */
function futureLine_(s) {
  return String(s == null ? '' : s)
    .replace(/^﻿/, '')
    .replace(/^[\s\t]+/, '')
    .replace(/^#+\s*/, '')                       // マークダウン風の見出し記号
    .replace(/^[-*•◦○●▪‣・]\s*/, '')             // 箇条書きの記号
    .replace(/\s+$/, '');
}
/** 「1. 87歳(2056年)の完成図」のような章見出しか。章は必ず番号で始まる決まり */
function futureIsSection_(line) {
  return /^\d+\s*[.．、]\s*\S/.test(line);
}
/** 「1階・健康(大黒柱)」のような部屋の見出しか */
function futureIsRoomHead_(line) {
  if (/^\d階\s*[・･]/.test(line)) return true;          // いまの台帳の書き方
  // 書き方が変わったとき用の保険：短くて、文になっていない行だけ見出しとみなす
  return line.length <= 24 && !/[。]/.test(line) && futureRoom_(line) != null;
}

function readFuture_() {
  var doc = findFutureDoc_();
  if (!doc) { Logger.log('未来ビジョン台帳が見つかりません'); return null; }
  var docText = fetchDocText_(doc.getId());
  var out = {
    docTitle: doc.getName(), docId: doc.getId(), docUrl: doc.getUrl(),
    asOf: (doc.getName().match(/(\d{4}-\d{2}-\d{2})/) || [null, null])[1],
    ladder: [], axes: [], rooms: {}, flag: null, principle: null, tone: null
  };
  var section = null, room = null;
  var lines = String(docText).split(/\r\n|\r|\n|/);
  for (var i = 0; i < lines.length; i++) {
    var line = futureLine_(lines[i]);
    if (!line) continue;

    if (futureIsSection_(line)) {
      section = futureSection_(line); room = null; continue;
    }
    if (section === 'rooms' && futureIsRoomHead_(line)) {
      room = futureRoom_(line);
      if (room && !out.rooms[room]) out.rooms[room] = { heading: line, bullets: [] };
      continue;
    }
    if (section === 'rooms' && room) {
      if (out.rooms[room].bullets.length < 8) out.rooms[room].bullets.push(line);
      continue;
    }
    if (section === 'ladder') {
      /* v1.6.1：年のあとに注記が入る書き方に対応。
           これまで  「62歳(2031): 資産化工事の年。…」
           v3.3から  「62歳(2031)【v3.3・本人口述で塗り重ね】: 資産化工事の年。…」
         年かっこの直後に「:」が来る前提だったため、v3.3で **62歳の段が丸ごと落ちて
         はしごが4段になっていた**（アプリのボタンが87・77・72・67の4つになった真因）。
         かっこ書き（【】（）()）が何個はさまっても拾えるようにする。
         「61歳最後の日(2030/4/29):」は年かっこが4桁ちょうどでないのでここには当たらず、
         これまでどおり下の中間旗（flag）の行として拾われる。 */
      var m = line.match(/^(\d{2})歳\s*[(（](\d{4})[)）]\s*(?:[【（(][^】）)]*[】）)]\s*)*[:：]\s*(.+)$/);
      if (m) { out.ladder.push({ age: parseInt(m[1], 10), year: parseInt(m[2], 10), text: m[3].trim() }); continue; }
      var f = line.match(/^(\d{2})歳[^:：]*[(（]([\d\/\-]+)[)）]\s*[:：]\s*(.+)$/);   // 61歳最後の日(2030/4/29)
      if (f) { out.flag = { date: f[2].replace(/\//g, '-'), text: f[3].trim() }; continue; }
      var p = line.match(/^原則\s*[:：]\s*(.+)$/);
      if (p) { out.principle = p[1].trim(); continue; }
    }
    if (section === 'weekly') {
      if (/採点軸/.test(line)) {
        out.axes = line.split(/[①②③④⑤⑥]/).slice(1)
          .map(function (s) { return s.trim(); }).filter(function (s) { return s; });
        continue;
      }
      var t2 = line.match(/^口調\s*[:：]\s*(.+)$/);
      if (t2) { out.tone = t2[1].trim(); continue; }
    }
  }
  out.ladder.sort(function (a, b) { return b.age - a.age; });        // 87→62 の並び
  if (!out.ladder.length && !Object.keys(out.rooms).length) {
    Logger.log('⚠️ 未来ビジョン台帳の見出しから何も拾えませんでした: ' + doc.getName());
    return null;
  }
  Logger.log('未来ビジョン台帳: ' + doc.getName() + '（はしご' + out.ladder.length +
             '段／部屋' + Object.keys(out.rooms).length + '／軸' + out.axes.length + '）');
  return out;
}

// ===== v1.2: base + デルタ形式の台帳を読む共通部品 =====
/** フォルダの中から base とデルタを見つけ、弱い順（base → 古いデルタ → 新しいデルタ）に返す */
function ledgerFiles_(folderId, baseName, deltaRe) {
  var out = [];
  var it = DriveApp.getFolderById(folderId).getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;
    var n = f.getName(), rank = null;
    if (n === baseName) rank = 0;
    else if (deltaRe.test(n)) rank = 1;
    if (rank == null) continue;
    out.push({ file: f, name: n, rank: rank, t: f.getLastUpdated().getTime() });
  }
  out.sort(function (a, b) { return (a.rank - b.rank) || (a.t - b.t); });
  return out;
}
/** 見出し行を探し、項目名（別名の配列）→ 列番号 の対応を作る。先頭一致で拾う */
function findColumns_(values, spec, requiredKey) {
  for (var i = 0; i < Math.min(values.length, 10); i++) {
    var norm = values[i].map(normHead_);
    var map = {};
    Object.keys(spec).forEach(function (key) {
      spec[key].forEach(function (label) {
        if (map[key] != null) return;
        var want = normHead_(label);
        for (var c = 0; c < norm.length; c++) {
          if (norm[c] && norm[c].indexOf(want) === 0) { map[key] = c; return; }
        }
      });
    });
    if (map[requiredKey] != null) return { row: i, map: map };
  }
  return null;
}

// ===== v1.2: リミットレス台帳（知識・精神の部屋） =====
var LIMITLESS_KINDS = ['教え', 'トライ', '初めて', '学び', '人', 'もがき'];
var LIMITLESS_COLS = {
  date: ['日付', '記録日'], kind: ['種別', '分類'], text: ['内容'],
  who: ['関連'], src: ['出所']
};
/**
 * 種別セルを「確定タグ」と「未確定タグ」に分ける。
 *   ・「🔥トライ,🌱初めて」のように複数入ることがある → それぞれ1つとして数える
 *   ・「🌱初めて?」のように「?」が付いたものは本人がまだ決めかねている印。
 *     集計からは外し、詳細の行にはそのまま（?付きで）表示する。
 * 絵文字は増減しうるので、絵文字ではなく言葉（教え/トライ/初めて/学び/人/もがき）で判定する。
 */
function limitlessTags_(v) {
  var sure = [], unsure = [];
  String(v == null ? '' : v).split(/[,、\/／]/).forEach(function (tok) {
    var q = /[?？]/.test(tok);                        // このタグに「?」が付いているか
    LIMITLESS_KINDS.forEach(function (k) {
      if (tok.indexOf(k) < 0) return;
      var arr = q ? unsure : sure;
      if (arr.indexOf(k) < 0) arr.push(k);
    });
  });
  // 同じタグが確定と未確定の両方で出てきたら、確定を採る
  unsure = unsure.filter(function (k) { return sure.indexOf(k) < 0; });
  return { kinds: sure, unsure: unsure };
}
/** 集計に使う確定タグだけを返す（従来の呼び出し用） */
function limitlessKinds_(v) { return limitlessTags_(v).kinds; }
function readLimitless_() {
  var srcs = ledgerFiles_(CONFIG.limitlessFolderId, CONFIG.limitlessBaseName,
                          /^リミットレス台帳ログ_\d{4}-\d{2}-\d{2}/);
  var byKey = {}, used = [], baseUrl = null;
  srcs.forEach(function (s) {
    if (s.rank === 0) baseUrl = s.file.getUrl();
    var values;
    try { values = SpreadsheetApp.openById(s.file.getId()).getSheets()[0].getDataRange().getValues(); }
    catch (e) { Logger.log('読めませんでした: ' + s.name + ' / ' + e); return; }
    var hd = findColumns_(values, LIMITLESS_COLS, 'date');
    if (!hd) { Logger.log('見出しが見つかりません: ' + s.name); return; }
    var cnt = 0;
    for (var i = hd.row + 1; i < values.length; i++) {
      var row = values[i];
      var date = toDate_(row[hd.map.date]);
      var text = hd.map.text != null ? str_(row[hd.map.text]) : null;
      if (!date || !text) continue;
      var raw = hd.map.kind != null ? str_(row[hd.map.kind]) : null;
      var tags = limitlessTags_(raw);
      // 同じ日付×内容はデルタ（後から読んだ方）が勝つ
      byKey[date + '|' + text] = {
        date: date,
        kinds: tags.kinds,          // 集計に数えるタグ（「?」なし）
        unsure: tags.unsure,        // 「?」付き＝未確定。数えないが画面には出す
        kindsText: raw,             // 種別セルの原文（詳細行の表示用）
        text: text,
        who: hd.map.who != null ? str_(row[hd.map.who]) : null,
        src: (hd.map.src != null ? str_(row[hd.map.src]) : null) || s.name
      };
      cnt++;
    }
    used.push({ name: s.name, rows: cnt });
  });
  var rows = Object.keys(byKey).sort().map(function (k) { return byKey[k]; });
  var cutoff = Utilities.formatDate(
    new Date(new Date().getTime() - CONFIG.limitlessKeepDays * 86400000), 'Asia/Tokyo', 'yyyy-MM-dd');
  rows = rows.filter(function (r) { return r.date >= cutoff; });
  Logger.log('リミットレス台帳: ' + rows.length + '行（' + CONFIG.limitlessKeepDays + '日以内）');
  return { baseName: CONFIG.limitlessBaseName, baseUrl: baseUrl,
           folderUrl: 'https://drive.google.com/drive/folders/' + CONFIG.limitlessFolderId,
           used: used, rows: rows };
}

/**
 * 知識の部屋にそのまま出す形（data.json の knowledge）。
 *   week  … 今週＝日曜0:00〜土曜24:00（基準日を含む週）の6分類カウント
 *   month … 今月（1日〜末日）の6分類カウント
 *   recent… 直近5行（新しい順）
 *   folderUrl … 「リミットレス台帳」フォルダへのリンク
 * 「?」付きタグは kinds に入っていないので、ここで数えれば自動的に集計から外れる。
 * 1行に2つタグがあれば、それぞれのタグで1カウントずつ数える。
 */
function buildKnowledge_(limitless, asOf) {
  var rows = (limitless && limitless.rows) || [];
  var week = weekWindow_(asOf), month = monthWindow_(asOf);
  var count = function (win) {
    var c = {};
    LIMITLESS_KINDS.forEach(function (k) { c[k] = 0; });
    rows.forEach(function (r) {
      if (r.date < win.from || r.date > win.to) return;
      (r.kinds || []).forEach(function (k) { if (c[k] != null) c[k]++; });
    });
    return c;
  };
  var inWin = function (win) {
    return rows.filter(function (r) { return r.date >= win.from && r.date <= win.to; }).length;
  };
  var recent = rows.slice(-5).reverse().map(function (r) {
    return { date: r.date, kinds: r.kinds, unsure: r.unsure,
             kindsText: r.kindsText, text: r.text, who: r.who };
  });
  return {
    asOf: asOf,
    kinds: LIMITLESS_KINDS,
    week:  { from: week.from,  to: week.to,  rows: inWin(week),  counts: count(week) },
    month: { from: month.from, to: month.to, rows: inWin(month), counts: count(month) },
    recent: recent,
    total: rows.length,
    folderUrl: 'https://drive.google.com/drive/folders/' + CONFIG.limitlessFolderId,
    baseName: CONFIG.limitlessBaseName
  };
}

/** 日付文字列の曜日番号（0=日 … 6=土）。タイムゾーンに左右されないようUTCで計算する */
function dowNum_(ds) {
  return new Date(Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10))).getUTCDay();
}
/** 日付文字列に n 日足す */
function addDays_(ds, n) {
  var d = new Date(Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10) + n));
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}
/** その日を含む週（日曜0:00〜土曜24:00） */
function weekWindow_(ds) {
  var from = addDays_(ds, -dowNum_(ds));
  return { from: from, to: addDays_(from, 6) };
}
/** その日を含む月（1日〜末日） */
function monthWindow_(ds) {
  var first = ds.slice(0, 7) + '-01';
  var d = new Date(Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7), 0));   // 翌月0日＝今月末日
  return { from: first, to: ds.slice(0, 7) + '-' + ('0' + d.getUTCDate()).slice(-2) };
}

// ===== v1.2: 経済台帳（経済の部屋） =====
/* v1.2.1：引っ越し先の「経済台帳（株式・債券・貴金属）」は列の名前が少し違う。
     旧: 記録日 / 口座・資産名 / 区分 / 評価額 / 通貨 / 出所
     新: 日付   / 区分 / 項目 / 数量・額面 / 評価額円 / 評価損益円 / 損益率 / 備考
   どちらでも読めるように別名を足す（先頭一致なので「評価額円」は「評価額」で拾える）。 */
var ECO_COLS = {
  date: ['記録日', '日付'], name: ['口座', '資産名', '口座/資産名', '項目'], cat: ['区分'],
  amount: ['評価額', '金額'], currency: ['通貨'], src: ['出所', '備考']
};

/**
 * 新しい台帳は1つの記録日に「総括 → 資産クラス → 個別銘柄」の3段が入っている。
 * 全部足すと同じ資産を3回数えてしまうので、行がどの段のものかを見分ける。
 *   total … 総括（口座合計・総資産・My資産）… 足さない
 *   class … 資産クラス（米国株式・外貨建債券・預り金・貴金属）… これを足すと総資産になる
 *   item  … 個別の銘柄や口座（旧台帳の1行もここ）
 *   memo  … 参考為替などのメモ … 足さない
 *
 * v1.5【要件2】区分が「総括」でなくても、項目名に「合計」「総額」「My資産」が入っていれば
 * それは小計行なので item の合算から外す（表示には残す）。
 * 例：区分「現金」＋項目「SBI My資産合計」のように書かれても二重計上しない。
 */
var ECO_SUBTOTAL_RE = /合計|総額|My資産/i;
function ecoLevel_(cat, name) {
  var n = String(name == null ? '' : name);
  if (ECO_SUBTOTAL_RE.test(n)) return 'total';
  var s = String(cat == null ? '' : cat);
  if (!s) return 'item';
  if (/総括|総資産|合計/.test(s)) return 'total';
  if (/資産クラス/.test(s)) return 'class';
  if (/メモ|参考/.test(s)) return 'memo';
  return 'item';
}

/* v1.5【要件5・6】その行がどの口座のものかを「出所／項目／備考／区分」の文字列から見分ける。
   観測定義書v2の記帳ルールでは、各行に出所（SBIメイン／SBI貴金属／野村／個人銀行／法人）を書く。

   並び順が大事：
     ① 法人   … 最優先。銀行にあっても野村にあっても、法人の行は法人（個人と絶対に混ぜない）
     ② 野村   … 野村由来の行
     ③ 貴金属 … SBIの別サイト（gold.sbisec.co.jp）。通常アプリのMy資産には出ない
     ④ 銀行   … 個人銀行の残高
     ⑤ SBI    … 上のどれでもなくSBIとあればSBIメイン
   貴金属は「SBI貴金属／貴金属口座／金・銀・プラチナ」のような口座を指す書き方だけを拾う。
   備考の「貴金属ロイヤルティ」（＝SBIメインで持っている米国株）を金口座と取り違えないため。

   どれにも当たらない行は null（＝判定不能）。呼ぶ側で SBIメインとして扱い、必ず警告に残す。 */
var ECO_ACCOUNTS = [
  { key: 'corp',   re: /法人/ },
  { key: 'nomura', re: /野村/ },
  { key: 'gold',   re: /SBI\s*貴金属|貴金属口座|金・銀・プラチナ|金銀プラチナ|gold\.sbisec/i },
  { key: 'bank',   re: /個人銀行|銀行口座|銀行預金|銀行残高|普通預金|ゆうちょ|信用金庫|信金/ },
  { key: 'sbi',    re: /SBI/i }
];
var ECO_ACCOUNT_LABEL = { sbi: 'SBIメイン', gold: 'SBI貴金属', nomura: '野村', bank: '個人銀行', corp: '法人' };
// 合計線＝この4つが同じ日に揃ったときだけ点を打つ（観測定義書v2）
var ECO_PERSONAL_ACCOUNTS = ['sbi', 'gold', 'nomura', 'bank'];
var ECO_DEFAULT_ACCOUNT = 'sbi';

function ecoAccount_(cat, name, src) {
  var s = [cat, name, src].join(' ');
  for (var i = 0; i < ECO_ACCOUNTS.length; i++) {
    if (ECO_ACCOUNTS[i].re.test(s)) return ECO_ACCOUNTS[i].key;
  }
  return null;
}
function fmtYen_(n) {
  return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '円';
}

function readEco_() {
  var srcs = ledgerFiles_(CONFIG.ecoFolderId, CONFIG.ecoBaseName, /^経済台帳ログ_\d{4}-\d{2}-\d{2}/);
  var byKey = {}, used = [], baseUrl = null;
  srcs.forEach(function (s) {
    if (s.rank === 0) baseUrl = s.file.getUrl();
    var values;
    try { values = SpreadsheetApp.openById(s.file.getId()).getSheets()[0].getDataRange().getValues(); }
    catch (e) { Logger.log('読めませんでした: ' + s.name + ' / ' + e); return; }
    var hd = findColumns_(values, ECO_COLS, 'date');
    if (!hd) { used.push({ name: s.name, rows: 0 }); return; }   // 雛形だけの状態
    var cnt = 0;
    for (var i = hd.row + 1; i < values.length; i++) {
      var row = values[i];
      var date = toDate_(row[hd.map.date]);
      var name = hd.map.name != null ? str_(row[hd.map.name]) : null;
      if (!date || !name) continue;
      // 同じ記録日×口座はデルタが勝つ
      var cat = hd.map.cat != null ? str_(row[hd.map.cat]) : null;
      var src = (hd.map.src != null ? str_(row[hd.map.src]) : null) || s.name;
      byKey[date + '|' + name] = {
        date: date, name: name,
        cat: cat,
        level: ecoLevel_(cat, name),
        account: ecoAccount_(cat, name, src),      // null＝判定不能（あとで警告に出す）
        amount: hd.map.amount != null ? money_(row[hd.map.amount]) : null,
        currency: (hd.map.currency != null ? str_(row[hd.map.currency]) : null) || 'JPY',
        src: src
      };
      cnt++;
    }
    used.push({ name: s.name, rows: cnt });
  });
  var all = Object.keys(byKey).sort().map(function (k) { return byKey[k]; });

  /* v1.5【要件6】二階建て。区分「法人」の行は、ここで個人からきれいに切り離す。
     以降の合計・推移・家画面の経済カードは personal しか見ないので、混ざりようがない。 */
  var corpRows = all.filter(function (r) { return r.account === 'corp'; });
  var personal = all.filter(function (r) { return r.account !== 'corp'; });

  // 表示は「いちばん新しい記録日の一式」だけでよい（資産は積み上げではなく残高のため）
  var latest = personal.length ? personal[personal.length - 1].date : null;
  var rows = latest ? personal.filter(function (r) { return r.date === latest; }) : [];

  // 記録日ごとの個人資産（口座別＋合計）。合計の出し方はこの1本に集約してある。
  var history = ecoHistory_(personal);
  var todayPt = history.length ? history[history.length - 1] : null;
  var total = todayPt ? todayPt.total : 0;

  var corp = ecoCorp_(corpRows);
  var warnings = ecoWarnings_(all, history);

  Logger.log('経済台帳: 個人' + rows.length + '件' + (latest ? '（' + latest + '時点）' : '（データ待ち）') +
             ' 個人資産合計 ' + fmtYen_(total) +
             '（' + (todayPt ? todayPt.accounts.map(function (k) {
                return ECO_ACCOUNT_LABEL[k] + ' ' + fmtYen_(todayPt[k]);
              }).join(' + ') : '—') + '）' +
             ' 推移' + history.length + '点／合計線' +
             history.filter(function (p) { return p.complete; }).length + '点' +
             '／法人' + corp.monthly.length + 'ヶ月' +
             (corp.latest ? '（最新 ' + corp.latest.date + ' ' + fmtYen_(corp.latest.amount) + '）' : ''));

  return { baseName: CONFIG.ecoBaseName, baseUrl: baseUrl,
           folderUrl: 'https://drive.google.com/drive/folders/' + CONFIG.ecoFolderId,
           asOf: latest, used: used, rows: rows, history: history,
           accounts: todayPt ? todayPt.accounts : [],
           complete: todayPt ? !!todayPt.complete : false,
           corp: corp, warnings: warnings,
           sumLevel: todayPt ? todayPt.level : 'item', total: Math.round(total) };
}

/**
 * 記録日ごとの個人資産を出す（アプリの推移グラフ3系列の材料）。
 *
 * 日ごと・口座ごとに、「資産クラスの行があればそれだけ」を足す。総括とメモは足さない。
 * 記録日をまたいで足し込まない（資産は積み上げではなく、その日の残高のため）。
 *
 * 1点＝{ date, sbi, gold, nomura, bank, total, accounts, complete, level, rows }
 *   ・sbi/gold/nomura/bank … その日その口座の残高（記録が無い口座はキー自体が無い）
 *   ・total    … その日に届いている個人の口座を足したもの（＝家画面の経済カードの値）
 *   ・complete … 4口座が同じ日に揃ったか。合計線はこれが true の日だけ点を打つ
 *
 * 口座が書かれていない行は SBIメインとして数える（古い台帳はSBIメインしか無いため）。
 * 取り違えたままにしないよう、判定不能な行は ecoWarnings_ が必ず警告に出す。
 */
function ecoHistory_(all) {
  var byDate = {};
  (all || []).forEach(function (r) {
    if (r.account === 'corp') return;                 // 法人は個人の線に混ぜない
    (byDate[r.date] = byDate[r.date] || []).push(r);
  });
  // 合計線の条件。この関数だけで完結させておく（テストが関数単体で動くように）
  var NEED = ['sbi', 'gold', 'nomura', 'bank'];
  return Object.keys(byDate).sort().map(function (d) {
    var list = byDate[d];
    var acc = {};
    list.forEach(function (r) { var k = r.account || 'sbi'; (acc[k] = acc[k] || []).push(r); });
    var out = { date: d, rows: 0, total: 0 }, present = [];
    Object.keys(acc).forEach(function (k) {
      var L = acc[k];
      var hasCls = L.some(function (r) { return r.level === 'class'; });
      var use = L.filter(function (r) {
        return hasCls ? r.level === 'class' : (r.level !== 'total' && r.level !== 'memo');
      });
      if (!use.length) return;
      out[k] = Math.round(use.reduce(function (a, r) { return a + (r.amount || 0); }, 0));
      out.rows += use.length;
      out.total += out[k];
      present.push(k);
    });
    out.level = list.some(function (r) { return r.level === 'class'; }) ? 'class' : 'item';
    out.accounts = present.sort();
    out.complete = NEED.every(function (k) { return present.indexOf(k) >= 0; });
    return out;
  });
}

/**
 * v1.5【要件6】法人メーター（会社の現金）。
 * 月1回の棚卸しで記録する想定なので月次で持つ。同じ月に複数あれば新しい記録を採る。
 * ここで出した数字は個人の合計にも合計線にも足さない（＝別メーター）。
 */
function ecoCorp_(rows) {
  var byDate = {};
  (rows || []).forEach(function (r) { (byDate[r.date] = byDate[r.date] || []).push(r); });
  var byYm = {};
  Object.keys(byDate).sort().forEach(function (d) {
    var L = byDate[d];
    var hasCls = L.some(function (r) { return r.level === 'class'; });
    var use = L.filter(function (r) {
      return hasCls ? r.level === 'class' : (r.level !== 'total' && r.level !== 'memo');
    });
    byYm[d.slice(0, 7)] = {
      ym: d.slice(0, 7), date: d, rows: use.length,
      amount: Math.round(use.reduce(function (a, r) { return a + (r.amount || 0); }, 0)),
      items: use.map(function (r) { return { name: r.name, amount: Math.round(r.amount || 0) }; })
    };
  });
  var monthly = Object.keys(byYm).sort().map(function (ym) { return byYm[ym]; });
  return { monthly: monthly, latest: monthly.length ? monthly[monthly.length - 1] : null };
}

/**
 * v1.5【要件3・5】経済台帳の健全性チェック。
 *   ① 口座を判定できない行（＝出所が書かれていない）… 記録日ごとに1件にまとめて info
 *   ② 同じ日の合算と総括行の乖離が5%を超える     … 二重計上か記帳もれの疑いで warn
 * 法人の行は個人の合算に入らないので、②の突合からも外す。
 */
var ECO_TOTAL_GAP = 0.05;
function ecoWarnings_(all, history) {
  var out = [];
  var add = function (level, kind, date, text) {
    out.push({ level: level, kind: kind, date: date || null, text: text });
  };

  // ① 出所が書かれていない行
  var unknown = {};
  (all || []).forEach(function (r) {
    if (r.account) return;
    (unknown[r.date] = unknown[r.date] || []).push(r.name);
  });
  Object.keys(unknown).sort().forEach(function (d) {
    var names = unknown[d];
    Logger.log('⚠️ 口座を判定できない行（SBIメインとして扱いました） ' + d + ' / ' + names.length + '件: ' +
               names.join(' / '));
    add('info', 'ecoAccountUnknown', d,
      d + 'の' + names.length + '件は出所（SBIメイン／SBI貴金属／野村／個人銀行／法人）が' +
      '書かれていないため、SBIメインとして数えました：' + names.slice(0, 3).join('・') +
      (names.length > 3 ? ' ほか' + (names.length - 3) + '件' : ''));
  });

  // ② 合算と総括行の乖離
  var byDate = {};
  (all || []).forEach(function (r) {
    if (r.account === 'corp') return;
    (byDate[r.date] = byDate[r.date] || []).push(r);
  });
  (history || []).forEach(function (p) {
    var tots = (byDate[p.date] || []).filter(function (r) {
      return r.level === 'total' && r.amount != null;
    });
    if (!tots.length) return;
    var grand = tots.reduce(function (a, r) { return Math.max(a, r.amount); }, 0);
    if (!grand) return;
    var gap = Math.abs(p.total - grand) / grand;
    if (gap <= ECO_TOTAL_GAP) return;
    var pct = Math.round(gap * 1000) / 10;
    Logger.log('⚠️ ' + p.date + ' の合算 ' + fmtYen_(p.total) + ' と総括行 ' + fmtYen_(grand) +
               ' が ' + pct + '% ずれています（二重計上・記帳もれを疑ってください）');
    add('warn', 'ecoTotalGap', p.date,
      p.date + 'の個別行の合算（' + fmtYen_(p.total) + '）と台帳の総括行（' + fmtYen_(grand) +
      '）が' + pct + '%ずれています。同じ資産を二重に書いていないか、記帳もれが無いか確かめてください');
  });

  return out;
}

// ===== v1.6: Googleカレンダー（会食の「枠」と「予約」） =====
/**
 * 会食は3つの数字でできている。
 *   ・枠   … カレンダーに置いてある「🎁ご褒美枠」（＝会食に使ってよい日）
 *   ・予約 … その枠のうち、相手が決まってタイトルが書き換わったもの
 *   ・実績 … GOKIGEN台帳の「会食」欄（＝実際に行った日）
 * ここで読むのは前の2つ。実績は今までどおり台帳から取る。
 *
 * **読むだけ**（CalendarApp の読み取りのみ）。予定を作ったり書き換えたりは一切しない。
 * そのぶん appsscript.json に足すスコープも calendar.readonly の1本だけで済む。
 *
 * 判定はタイトルの言葉だけで行う（色や説明文は見ない）。本人が手で書き換える運用なので、
 * 実際に置かれているタイトルに合わせてある：
 *   🎁ご褒美枠｜空き（客/師/恩/友/家族）          → 空き枠
 *   🎁ご褒美枠｜家族推奨（11月分）                 → 空き枠（家族におすすめ、というだけでまだ空き）
 *   🎁ご褒美枠（家族枠・確定）｜9/20 …             → 予約（家族）
 *   予約済：客枠 / 「正泰苑」新橋店 ご褒美枠（友人枠） → 予約（客・友）
 *   🎁ご褒美枠｜予備（家族9/20確定につき原則不使用） → どちらにも数えない
 */
var CAL_SLOT_RE   = /ご褒美枠/;                       // これが無い予定は会食の枠ではない
var CAL_SKIP_RE   = /予備|不使用|無視でOK|キャンセル|中止|取消/;
var CAL_BOOKED_RE = /予約済|確定/;
var CAL_OPEN_RE   = /空き|推奨|候補/;

// 区分。**家族をいちばん先に見る**（「家族」を「客」や「友」に取られないため）
var CAL_CATS = [
  { key: 'family', label: '家族', re: /家族|妻|長女|アキさん/ },
  { key: 'client', label: '客',   re: /客|顧客/ },
  { key: 'mentor', label: '師',   re: /師/ },
  { key: 'okuri',  label: '恩',   re: /恩/ },
  { key: 'friend', label: '友',   re: /友/ }
];

/**
 * タイトルから「空き枠 / 予約 / 数えない」を決める。見る順番が命。
 *   ① 予備・不使用 … 置いてあるだけで使わない枠。空きにも予約にも数えない
 *   ② 予約済・確定 … 相手が決まっている
 *   ③ 空き・推奨・候補 … まだ空いている
 *   ④ それ以外（例「正泰苑 ご褒美枠（友人枠）」）… **予約**として数える。
 *      店名や相手が書いてある枠は、もう相手が決まっているから。
 *      空き枠には必ず「空き」か「推奨」が入る運用なので、ここに落ちてくるのは予約だけ。
 */
function calKind_(title) {
  var t = String(title == null ? '' : title);
  if (!CAL_SLOT_RE.test(t)) return null;      // そもそも会食の枠ではない
  if (CAL_SKIP_RE.test(t))   return 'skip';
  if (CAL_BOOKED_RE.test(t)) return 'booked';
  if (CAL_OPEN_RE.test(t))   return 'open';
  return 'booked';
}

/**
 * 区分（客/師/恩/友/家族）。まずタイトルの括弧の中を見て、無ければタイトル全体を見る。
 * ただし「空き（客/師/恩/友/家族）」のように括弧の中が**選択肢の一覧**（3つ以上が並ぶ）に
 * なっているときは、それは区分ではなくメニューなので読み飛ばす。
 */
function calCat_(title) {
  var t = String(title == null ? '' : title);
  var inner = (t.match(/[（(]([^）)]*)[）)]/g) || [])
    .map(function (x) { return x.slice(1, -1); }).join(' ');
  var hits = CAL_CATS.filter(function (c) { return c.re.test(inner); });
  if (hits.length && hits.length < 3) return hits[0].key;   // 括弧の中に区分が書いてある
  /* 括弧の中が選択肢の一覧（3つ以上）だったときは、括弧ごと外してから本文を見る。
     外さずに本文を見ると「空き（客/師/恩/友/家族）」の一覧を区分と読んでしまう。 */
  var outer = t.replace(/[（(][^）)]*[）)]/g, ' ');
  for (var i = 0; i < CAL_CATS.length; i++) if (CAL_CATS[i].re.test(outer)) return CAL_CATS[i].key;
  return null;
}

/**
 * primaryカレンダーから、今日〜calMonthsAheadヶ月先の「ご褒美枠」を読む。
 * アプリ側で月ごとに数え直せるよう、**1件1行のまま**渡す（集計はアプリの仕事）。
 * 同じ日に同じタイトルの予定が二重にあったら1件として数える。
 */
function readCalendar_(asOf) {
  var from = new Date(asOf + 'T00:00:00+09:00');
  var to = new Date(from.getTime());
  to.setMonth(to.getMonth() + CONFIG.calMonthsAhead);
  var cal = CalendarApp.getDefaultCalendar();
  var raw = cal.getEvents(from, to);

  var seen = {}, events = [], skipped = [];
  raw.forEach(function (e) {
    var title = String(e.getTitle() || '');
    var kind = calKind_(title);
    if (!kind) return;                                  // 会食の枠ではない予定
    var date = Utilities.formatDate(e.getStartTime(), 'Asia/Tokyo', 'yyyy-MM-dd');
    var key = date + '|' + title;
    if (seen[key]) return;
    seen[key] = 1;
    if (kind === 'skip') { skipped.push({ date: date, title: title }); return; }
    events.push({ date: date, ym: date.slice(0, 7), title: title,
                  kind: kind, cat: kind === 'booked' ? calCat_(title) : null });
  });
  events.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

  var nOpen = events.filter(function (x) { return x.kind === 'open'; }).length;
  Logger.log('Googleカレンダー: 枠' + events.length + '件（予約' + (events.length - nOpen) +
             '・空き' + nOpen + '）／数えない枠' + skipped.length + '件　' +
             asOf + ' 〜 ' + Utilities.formatDate(to, 'Asia/Tokyo', 'yyyy-MM-dd'));
  return {
    asOf: asOf,
    from: asOf,
    to: Utilities.formatDate(to, 'Asia/Tokyo', 'yyyy-MM-dd'),
    monthsAhead: CONFIG.calMonthsAhead,
    monthCap: CONFIG.calMonthCap,
    calendarName: cal.getName(),
    count: events.length,
    events: events,
    skipped: skipped
  };
}

// ===== v1.6: note台帳（仕事タブの note カード） =====
/* GOKIGEN台帳フォルダ直下の「note台帳ログ_YYYY-MM-DD」を読む。
   列＝記録日／集計時刻／期間種別／期間／全体ビュー／コメント／スキ／備考。
   期間種別は「月間」と「全期間」の2行が同じ記録日で並ぶ作りなので、両方を持ち帰る。
   画面に出すのは**いちばん新しい記録日**のぶんだけ（過去ぶんは推移用に少しだけ残す）。 */
var NOTE_COLS = {
  date:  ['記録日', '日付'], time: ['集計時刻'], span: ['期間種別'], period: ['期間'],
  views: ['全体ビュー', 'ビュー'], comments: ['コメント'], likes: ['スキ'], note: ['備考']
};
var NOTE_KEEP = 30;                     // data.jsonに残す行数（肥大化させない）

function readNote_() {
  var folder = DriveApp.getFolderById(CONFIG.gokigenFolderId);
  var re = new RegExp('^' + CONFIG.noteDeltaPrefix + '\\d{4}-\\d{2}-\\d{2}');
  var srcs = [];
  var it = folder.getFiles();                                  // 直下のみ（圧縮済みフォルダは見ない）
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;
    if (f.isTrashed()) continue;                              // v1.7.2：ゴミ箱のものは読まない
    if (!re.test(f.getName())) continue;
    srcs.push({ file: f, name: f.getName(), t: f.getLastUpdated().getTime() });
  }
  if (!srcs.length) {
    Logger.log('note台帳: まだありません（' + CONFIG.noteDeltaPrefix + 'YYYY-MM-DD を置けば読みます）');
    return { rows: [], used: [], asOf: null, month: null, all: null,
             folderUrl: 'https://drive.google.com/drive/folders/' + CONFIG.gokigenFolderId };
  }
  srcs.sort(function (a, b) { return a.t - b.t; });            // 古い順＝後から読んだ方が勝つ

  var byKey = {}, used = [], latestUrl = null;
  srcs.forEach(function (s) {
    var values;
    try { values = SpreadsheetApp.openById(s.file.getId()).getSheets()[0].getDataRange().getValues(); }
    catch (e) { Logger.log('読めませんでした: ' + s.name + ' / ' + e); return; }
    var hd = findColumns_(values, NOTE_COLS, 'date');
    if (!hd) { Logger.log('見出しが見つかりません: ' + s.name); return; }
    latestUrl = s.file.getUrl();
    var cnt = 0;
    for (var i = hd.row + 1; i < values.length; i++) {
      var row = values[i];
      var date = toDate_(row[hd.map.date]);
      if (!date) continue;
      var span = hd.map.span != null ? str_(row[hd.map.span]) : null;
      if (!span) continue;                                     // 期間種別の無い行は読み飛ばす
      byKey[date + '|' + span] = {
        date: date,
        time: hd.map.time != null ? timeStr_(row[hd.map.time], 'Asia/Tokyo') : null,
        span: span,
        period: hd.map.period != null ? str_(row[hd.map.period]) : null,
        views:    num_(row[hd.map.views]),
        comments: num_(row[hd.map.comments]),
        likes:    num_(row[hd.map.likes]),
        note: hd.map.note != null ? str_(row[hd.map.note]) : null,
        src: s.name
      };
      cnt++;
    }
    used.push({ name: s.name, rows: cnt });
  });

  var rows = Object.keys(byKey).sort().map(function (k) { return byKey[k]; });
  if (!rows.length) {
    Logger.log('note台帳: ' + srcs.length + '本あるが1行も読めませんでした');
    return { rows: [], used: used, asOf: null, month: null, all: null,
             folderUrl: 'https://drive.google.com/drive/folders/' + CONFIG.gokigenFolderId };
  }
  var asOf = rows[rows.length - 1].date;                       // いちばん新しい記録日を採用
  var pick = function (re2) {
    var hit = rows.filter(function (r) { return r.date === asOf && re2.test(r.span); });
    return hit.length ? hit[hit.length - 1] : null;
  };
  var all   = pick(/全期間/);
  var month = pick(/月間/);
  Logger.log('note台帳: ' + rows.length + '行（最新 ' + asOf + '／月間 ' +
             (month ? month.views + 'ビュー・' + month.likes + 'スキ' : '—') + '／全期間 ' +
             (all ? all.views + 'ビュー' : '—') + '）');
  return {
    asOf: asOf,
    time: (month && month.time) || (all && all.time) || null,
    month: month, all: all,
    rows: rows.slice(-NOTE_KEEP),
    used: used,
    fileUrl: latestUrl,
    folderUrl: 'https://drive.google.com/drive/folders/' + CONFIG.gokigenFolderId
  };
}

// ===== v1.7: 行きたい場所台帳（行きたい場所マップの材料） =====
/* v1.7.2：状態の書き方は台帳を作り直すたびにゆれる（「済」→「行った」、「予定」→「計画」）。
   言葉のゆれで**登った山が未踏に戻る**ので、書き方の候補をここに集めて全部拾う。
   アプリ側（places.html）にも同じ規則を置いてある。 */
var STATUS_DONE_RE   = /済|行った|登った|完了/;
var STATUS_PLAN_RE   = /予定|計画/;
var STATUS_REJECT_RE = /却下|見送/;

/**
 * GOKIGEN台帳フォルダの中の「行きたい場所台帳_base」を、**書いてあるまま**読む。
 *
 * 表示専用の台帳なので、ここでは並べ替えも判定もしない（アプリ側の仕事）。
 * ただし2つだけ決めごとがある：
 *   ・状態が「却下」の行は data.json に出さない（見送った場所を家族に見せない）
 *   ・緯度か経度が空の行は **出したうえで** 警告ログを残す
 *     （地図には出せないが、写真タイルには出せるので落とさない）
 *
 * 写真は台帳に書かない方針。空欄の行の写真は places-photos.json（Wikimedia Commons）
 * から places.html 側で当てる。台帳の「写真URL」に値があれば、そちらが優先される。
 */
var PLACES_COLS = {
  id:       ['id', 'ID'],
  name:     ['場所', '名前'],
  kind:     ['区分'],
  area:     ['地方・国', '地方'],
  lat:      ['緯度'],
  lng:      ['経度'],
  effort:   ['体力'],
  season:   ['ベストシーズン'],
  timing:   ['推奨時期'],
  withWhom: ['同行'],
  status:   ['状態'],
  decided:  ['決めた時期'],
  note:     ['一言'],
  photo:    ['写真URL', '写真'],
  video:    ['映像URL', '映像'],
  source:   ['出典URL', '出典'],
  booking:  ['手配先'],
  output:   ['公開した成果物', '成果物']
};

/** 台帳のファイル。**名前が先・固定IDは予備**（作り直してIDが変わっても新しい方を読む） */
function placesFile_() {
  return ledgerByName_(CONFIG.placesFileName, CONFIG.placesFileId);
}

function readPlaces_() {
  var file = placesFile_();
  if (!file) { Logger.log('⚠️ 行きたい場所台帳が見つかりません'); return null; }
  var values = SpreadsheetApp.openById(file.getId()).getSheets()[0].getDataRange().getValues();
  var hd = findColumns_(values, PLACES_COLS, 'name');
  if (!hd) { Logger.log('⚠️ 行きたい場所台帳の見出し（場所／区分／緯度…）が見つかりません'); return null; }

  var rows = [], dropped = 0, noGeo = [];
  for (var i = hd.row + 1; i < values.length; i++) {
    var row = values[i];
    var cell = function (f) { var c = hd.map[f]; return c == null ? null : str_(row[c]); };
    var name = cell('name');
    if (!name) continue;                                  // 空行・見出しの続き
    var status = cell('status') || '';
    if (STATUS_REJECT_RE.test(status)) { dropped++; continue; }   // 見送った場所は出さない
    var lat = hd.map.lat != null ? num_(row[hd.map.lat]) : null;
    var lng = hd.map.lng != null ? num_(row[hd.map.lng]) : null;
    if (lat == null || lng == null) noGeo.push(name);      // 落とさずに警告だけ残す
    rows.push({
      id: cell('id') || ('X' + i), name: name,
      kind: cell('kind') || null, area: cell('area') || null,
      lat: lat, lng: lng,
      effort: cell('effort') || null, season: cell('season') || null,
      timing: cell('timing') || null, withWhom: cell('withWhom') || null,
      status: status || null, decided: cell('decided') || null,
      note: cell('note') || null,
      photo: cell('photo') || null, video: cell('video') || null,
      source: cell('source') || null, booking: cell('booking') || null,
      output: cell('output') || null
    });
  }

  var n = function (re, field) {
    return rows.filter(function (r) { return re.test(String(r[field] || '')); }).length;
  };
  Logger.log('行きたい場所台帳: ' + rows.length + '件（定番' + n(/定番/, 'kind') +
             '・日本' + n(/^日本$/, 'kind') + '・海外' + n(/海外/, 'kind') +
             '／予定' + n(STATUS_PLAN_RE, 'status') + '・済' + n(STATUS_DONE_RE, 'status') + '）' +
             (dropped ? '　※却下' + dropped + '件は出していません' : ''));
  if (noGeo.length) {
    Logger.log('⚠️ 緯度経度が空のため地図に出せません（写真タイルには出ます）: ' + noGeo.join('・'));
  }
  return {
    fileId: file.getId(), fileUrl: file.getUrl(), title: file.getName(),
    asOf: Utilities.formatDate(file.getLastUpdated(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    count: rows.length, dropped: dropped, noGeo: noGeo, rows: rows
  };
}

// ===== v1.7.1: 低山台帳（⛰低山タブ／山とセット温泉） =====
/**
 * 「低山台帳_base」を書いてあるまま読む。行きたい場所台帳とまったく同じ考え方：
 *   ・状態「却下」の行は出さない
 *   ・並べ替えや「今の時期のおすすめ」の判定は**ページ側**の仕事（ここではやらない）
 * ひとつだけ手を入れるのが「ベストシーズン月」で、
 * 「7,8,9,10」のような文字列を数字の並び [7,8,9,10] にほぐしておく
 * （ページ側で毎回パースすると、書き方のゆれ（全角カンマ・「月」つき）に何度も付き合うことになる）。
 */
var MTN_COLS = {
  id:      ['id', 'ID'],
  name:    ['山名', '山'],
  area:    ['エリア'],
  lat:     ['緯度'],
  lng:     ['経度'],
  elev:    ['標高'],
  ropeway: ['ロープウェイ', 'ロープウエイ'],
  walk:    ['山頂まで歩き', '歩き'],
  summer:  ['夏向き'],
  months:  ['ベストシーズン月', 'ベストシーズン'],
  effort:  ['体力'],
  onsen:   ['セット温泉', '温泉'],
  why:     ['行く意味'],
  status:  ['状態'],
  wentAt:  ['行った日'],
  planned: ['予定'],
  note:    ['一言'],
  photo:   ['写真URL', '写真'],
  video:   ['映像URL', '映像'],
  source:  ['出典URL', '出典'],
  output:  ['公開した成果物', '成果物']
};

/** 「7,8,9,10」「7月,8月」「７，８」→ [7,8,9,10]。1〜12だけ拾い、重複は落として並べる */
function mtnMonths_(v) {
  var t = String(v == null ? '' : v).replace(/[０-９]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
  });
  var out = [], seen = {};
  (t.match(/\d{1,2}/g) || []).forEach(function (x) {
    var n = parseInt(x, 10);
    if (n >= 1 && n <= 12 && !seen[n]) { seen[n] = 1; out.push(n); }
  });
  return out;
}

/** 台帳のファイル。**名前が先・固定IDは予備** */
function mtnFile_() {
  return ledgerByName_(CONFIG.mtnFileName, CONFIG.mtnFileId);
}

function readMountains_() {
  var file = mtnFile_();
  if (!file) { Logger.log('⚠️ 低山台帳が見つかりません'); return null; }
  var values = SpreadsheetApp.openById(file.getId()).getSheets()[0].getDataRange().getValues();
  var hd = findColumns_(values, MTN_COLS, 'name');
  if (!hd) { Logger.log('⚠️ 低山台帳の見出し（山名／エリア／標高…）が見つかりません'); return null; }

  var rows = [], dropped = 0, noGeo = [];
  for (var i = hd.row + 1; i < values.length; i++) {
    var row = values[i];
    var cell = function (f) { var c = hd.map[f]; return c == null ? null : str_(row[c]); };
    var name = cell('name');
    if (!name) continue;
    var status = cell('status') || '';
    if (STATUS_REJECT_RE.test(status)) { dropped++; continue; }
    var lat = hd.map.lat != null ? num_(row[hd.map.lat]) : null;
    var lng = hd.map.lng != null ? num_(row[hd.map.lng]) : null;
    if (lat == null || lng == null) noGeo.push(name);
    rows.push({
      id: cell('id') || ('M' + i), name: name, area: cell('area') || null,
      lat: lat, lng: lng,
      elev: hd.map.elev != null ? num_(row[hd.map.elev]) : null,
      ropeway: cell('ropeway') || null, walk: cell('walk') || null,
      summer: cell('summer') || null,
      months: mtnMonths_(hd.map.months != null ? row[hd.map.months] : ''),
      monthsText: cell('months') || null,
      effort: cell('effort') || null,
      onsen: cell('onsen') || null, why: cell('why') || null,
      status: status || null, wentAt: cell('wentAt') || null, planned: cell('planned') || null,
      note: cell('note') || null,
      photo: cell('photo') || null, video: cell('video') || null,
      source: cell('source') || null, output: cell('output') || null
    });
  }

  var n = function (fn) { return rows.filter(fn).length; };
  Logger.log('低山台帳: ' + rows.length + '座（夏向き' + n(function (r) { return /○/.test(String(r.summer || '')); }) +
             '／済' + n(function (r) { return STATUS_DONE_RE.test(String(r.status || '')); }) +
             '・予定' + n(function (r) { return STATUS_PLAN_RE.test(String(r.status || '')); }) + '）' +
             (dropped ? '　※却下' + dropped + '座は出していません' : ''));
  if (noGeo.length) Logger.log('⚠️ 緯度経度が空のため地図に出せません: ' + noGeo.join('・'));
  var noMonth = rows.filter(function (r) { return !r.months.length; }).map(function (r) { return r.name; });
  if (noMonth.length) Logger.log('⚠️ ベストシーズン月が読めません（おすすめに出ません）: ' + noMonth.join('・'));
  return {
    fileId: file.getId(), fileUrl: file.getUrl(), title: file.getName(),
    asOf: Utilities.formatDate(file.getLastUpdated(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    goal: CONFIG.mtnGoal, count: rows.length, dropped: dropped, noGeo: noGeo, rows: rows
  };
}

// ===== v1.4: WANT台帳（目標×差分の「目標」側） =====
/* 列の見出しはゆらぎうるので別名も用意する。findColumns_ は先頭一致なので、
   「現状の取り方」を先に置く（「現状」だけでも拾えるが、正式名を優先させる）。 */
var WANT_COLS = {
  room: ['部屋'], item: ['項目'], goal: ['目標値', '目標'], due: ['期限'],
  how:  ['現状の取り方'],          // 旧レイアウト：「自動: 体重」のような**取り方の説明**
  cur:  ['現状'],                  // 新レイアウト：「83.1kg」のような**書いてある実測**
  state: ['状態'],                 // 新レイアウト：未着手／進行中／完了 など
  note: ['備考', 'メモ']
};
/**
 * WANT台帳を「書いてあるまま」読む。
 *
 * ここでは判定を一切しない（自動／手動の仕分けも、差分の計算も、アプリ側でやる）。
 * そうしておけば、差分の出し方を直したいときに Apps Script を貼り替えずに済み、
 * 台帳に行が増えたときも、この関数は何も変えずにそのまま通る。
 */
/** WANT台帳のファイル。**名前が先・固定IDは予備** */
function wantFile_() {
  return ledgerByName_(CONFIG.wantFileName, CONFIG.wantFileId);
}

function readWant_() {
  var file = wantFile_();
  if (!file) { Logger.log('⚠️ WANT台帳が見つかりません'); return null; }
  var values = SpreadsheetApp.openById(file.getId()).getSheets()[0].getDataRange().getValues();
  var hd = findColumns_(values, WANT_COLS, 'room');
  if (!hd) { Logger.log('⚠️ WANT台帳の見出し（部屋／項目／目標値…）が見つかりません'); return null; }
  /* 旧レイアウトでは「現状の取り方」が cur('現状') にも先頭一致で引っかかる。
     同じ列なら cur は無かったことにする（「自動: 体重」を実測として出さないため）。 */
  var sameCol = (hd.map.how != null && hd.map.how === hd.map.cur);
  var rows = [];
  for (var i = hd.row + 1; i < values.length; i++) {
    var row = values[i];
    var cell = function (f) { var c = hd.map[f]; return c == null ? null : str_(row[c]); };
    var room = cell('room'), item = cell('item');
    if (!room || !item) continue;                     // 部屋と項目が無い行は見出しの続きや空行
    rows.push({ room: room, item: item, goal: cell('goal'), due: cell('due'),
                how: cell('how'),
                cur: sameCol ? null : cell('cur'),    // 台帳に書いてある現状（新レイアウト）
                state: cell('state'),
                note: cell('note') });
  }
  Logger.log('WANT台帳: ' + rows.length + '行（' + file.getName() + '／' +
             (hd.map.how != null ? '旧レイアウト：現状の取り方あり' : '新レイアウト：現状・状態あり') + '）');
  return { fileId: file.getId(), fileUrl: file.getUrl(), title: file.getName(),
           asOf: Utilities.formatDate(file.getLastUpdated(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
           rows: rows };
}

// ===== v1.4: 週報書棚（リンクだけ・中身は読まない） =====
/**
 * 📖_週報書棚 フォルダの中で、更新日時がいちばん新しいファイルの「名前とリンク」を返す。
 *
 * **中身は開かない。** アプリは受け取ったリンクを置くだけなので、
 * 週報がGoogleドキュメントでもPDFでも、形式を問わずそのまま扱える。
 * 中を解析しないぶん、OAuthのスコープは今の4本のまま増えない（＝本人に再承認が出ない）。
 */
function readWeekly_() {
  var folderUrl = 'https://drive.google.com/drive/folders/' + CONFIG.weeklyFolderId;
  var it = DriveApp.getFolderById(CONFIG.weeklyFolderId).getFiles();   // 直下のみ
  var best = null, n = 0;
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;                              // v1.7.2：ゴミ箱のものは読まない
    n++;
    var t = f.getLastUpdated().getTime();
    if (!best || t > best.t) {
      best = { t: t, name: f.getName(), url: f.getUrl(),
               modified: Utilities.formatDate(f.getLastUpdated(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') };
    }
  }
  if (best) delete best.t;
  Logger.log('週報書棚: ' + n + '本' + (best ? '／最新 ' + best.name + '（' + best.modified + '）' : '（まだ空）'));
  return { folderId: CONFIG.weeklyFolderId, folderUrl: folderUrl, count: n, latest: best };
}

// ===== v1.4: 自己バージョン（ver57.x） =====
/**
 * 誕生日を起点にした自己バージョン。誕生月を .00 とし、月がひとつ進むごとに .01 上がる。
 * 12ヶ月で整数部が1つ上がる（＝満年齢）。1969-04-30生まれなら 2026年8月＝ver57.04。
 * 日にちは見ない（誕生月はまるごと .00）。
 */
function selfVersion_(ds, birth) {
  var b = String(birth || CONFIG.birthDate);
  var t = (+ds.slice(0, 4) - +b.slice(0, 4)) * 12 + (+ds.slice(5, 7) - +b.slice(5, 7));
  if (t < 0) t = 0;
  var major = Math.floor(t / 12), minor = t % 12;
  return { birth: b, asOf: ds, major: major, minor: minor, months: t,
           version: 'ver' + major + '.' + ('0' + minor).slice(-2) };
}

// ===== 変換ヘルパー =====
function findHeader_(values, key) {
  for (var i = 0; i < Math.min(values.length, 10); i++) {
    if (String(values[i][0]).trim() === key) return i;
  }
  return -1;
}
/**
 * 記録日を YYYY-MM-DD に正規化する。突合キーに使うので、必ずここを通すこと。
 * 台帳ごとに書式が違う：
 *   2026-08-12（デルタ） / 2026/8/9（旧スナップショット） / 8/9/2026（xlsx由来の米国式）
 */
function toDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  var s = String(v || '').trim();
  var m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);       // 年が先
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);                  // 月/日/年（米国式）
  if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  return null;
}
function dowOf_(ds) {
  var d = new Date(ds + 'T00:00:00+09:00');
  return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
}
function num_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  var s = String(v).replace(/[,\s]/g, '');
  var m = s.match(/^-?\d+(\.\d+)?/);          // 「12.5 (1/8 白湯)」→ 12.5
  return m ? parseFloat(m[0]) : null;
}
function money_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  var s = String(v).replace(/[$,\s]/g, '');
  var n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function str_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  return s === '' ? null : s;
}
/**
 * ご機嫌度を10段階に統一して返す。
 * 台帳には「4/5」（5段階）と「6」（10段階）と「かなりよい」（言葉）が混在している。
 * 5段階の記録は×2して10段階に換算する。
 */
function mood_(v) {
  if (v === '' || v === null || v === undefined) return null;
  // 「4/5」をGoogleスプレッドシートが日付(4月5日)に変換してしまった場合の救済
  if (v instanceof Date) { var mm = v.getMonth() + 1; return (mm >= 1 && mm <= 5) ? mm * 2 : null; }
  // 素の数値: 5以下は5段階とみなして×2、6〜10はすでに10段階
  if (typeof v === 'number') {
    if (v >= 1 && v <= 5) return v * 2;
    return (v > 5 && v <= 10) ? v : null;
  }
  var s = String(v).trim();
  var m = s.match(/^(\d+)\s*\/\s*5/);
  if (m) return parseInt(m[1], 10) * 2;
  var m10 = s.match(/^(\d+)\s*\/\s*10/);
  if (m10) return parseInt(m10[1], 10);
  if (/かなりよい|とてもよい|最高/.test(s)) return 10;
  if (/よい|良い|ご機嫌/.test(s)) return 8;
  if (/ふつう|普通|真ん中/.test(s)) return 6;
  if (/わるい|悪い/.test(s)) return 4;
  var n = parseFloat(s);
  if (isNaN(n)) return null;
  if (n >= 1 && n <= 5) return n * 2;
  return (n > 5 && n <= 10) ? n : null;
}
/**
 * 基準時刻を「9:36」の形にする。
 *
 * 時刻だけのセルは、そのスプレッドシートのタイムゾーンで作られた Date として渡ってくる。
 * これを 'Asia/Tokyo' 固定で書き出すと時差のぶんだけズレる
 * （2026-08-13の台帳の 6:30 が、アプリでは 23:30 と表示されていた）。
 * 作られたときと同じタイムゾーンで書き戻せば、台帳で見たままの時刻になる。
 */
function timeStr_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz || sheetTimeZone_(null), 'H:mm');
  return str_(v);
}
/** そのシートのタイムゾーン。取れないときはスクリプトのもの、それも無ければ東京 */
function sheetTimeZone_(sheet) {
  try { if (sheet) return sheet.getParent().getSpreadsheetTimeZone(); } catch (e) { /* 続けて次を試す */ }
  try { return Session.getScriptTimeZone(); } catch (e) { /* テスト環境など */ }
  return 'Asia/Tokyo';
}
function ymStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/M');
  return str_(v);
}
function iso_(d) { return Utilities.formatDate(d, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function shortName_(full) {
  var s = String(full || '');
  s = s.replace(/^【[^】]*】/, '').trim();
  var cut = s.split(/[　\s！!。・／\/]/)[0];
  return (cut || s).slice(0, 14);
}

// ===== GitHub =====
function pushToGitHub_(content, previous) {
  var base = 'https://api.github.com/repos/' + CONFIG.repoOwner + '/' + CONFIG.repoName +
             '/contents/' + CONFIG.filePath;
  var headers = {
    Authorization: 'Bearer ' + getToken_(),
    Accept: 'application/vnd.github+json'
  };

  // 現在のファイルを取得（sha と 中身の比較用）
  var sha = null, currentText = null;
  var get = UrlFetchApp.fetch(base + '?ref=' + CONFIG.branch,
    { headers: headers, muteHttpExceptions: true });
  if (get.getResponseCode() === 200) {
    var meta = JSON.parse(get.getContentText());
    sha = meta.sha;
    try {
      currentText = Utilities.newBlob(Utilities.base64Decode(meta.content)).getDataAsString('UTF-8');
    } catch (e) { currentText = null; }
  } else if (get.getResponseCode() !== 404) {
    throw new Error('GitHub 取得失敗: ' + get.getResponseCode() + ' ' + get.getContentText());
  }

  // generatedAt 以外に差分がなければ何もしない（無意味なデプロイを避ける）
  if (currentText && stripGenerated_(currentText) === stripGenerated_(content)) {
    return '変更なし。GitHubへの書き込みはスキップしました。';
  }

  var payload = {
    message: 'data.json 自動更新 ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: CONFIG.branch
  };
  if (sha) payload.sha = sha;

  var put = UrlFetchApp.fetch(base, {
    method: 'put', headers: headers, contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = put.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('GitHub 書き込み失敗: ' + code + ' ' + put.getContentText());
  }
  return '✅ data.json を更新しました（' + JSON.parse(put.getContentText()).commit.sha.slice(0, 7) + '）';
}

function stripGenerated_(t) {
  return t.replace(/"generatedAt":\s*"[^"]*",?/, '');
}
