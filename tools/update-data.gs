/**
 * GOKIGEN OS — data.json 自動生成スクリプト（Google Apps Script）
 *
 * やること：
 *   1. Googleドライブの「GOKIGEN台帳」「Udemy台帳」フォルダの全ファイルを読む
 *   2. 全期間を1つに統合する（日付が重複したら「新しいファイル」を優先）
 *   3. GitHub の katsuyanakaji-TraZma/gokigen に data.json を書き込む
 *   4. Vercel が自動でデプロイ → アプリが最新になる
 *
 * 1日4回（8時・12時・18時・22時）自動実行。Google側のサーバーで動くので Mac mini の電源は関係ありません。
 * 前回の実行以降にどちらのフォルダにも新規/更新ファイルが無ければ、作り直さずスキップします。
 *
 * 初回だけ、この2つを1回ずつ実行してください：
 *   ① setupUdemyBase()  … Udemyの5年分履歴（xlsx）をスプレッドシート「Udemy台帳_base」に移植する
 *   ② setupTrigger()    … 1日4回の自動実行を予約する
 */

// ===== 設定 =====
var CONFIG = {
  gokigenFolderId: '1vJ7ddquLREjntkRUy235nv5FXaas2IoV',
  udemyFolderId:   '1g3hrPVRIYB_GOYho36DLRnITG_c5-elx',
  udemyXlsxId:     '1T7SE-LrYr4gtTxvyGkBDgNZ_4ruTnvJv', // 移植元。移植後は「_アーカイブ」に改名して以後さわらない
  udemyBaseName:    'Udemy台帳_base',
  udemyArchiveName: 'Udemyグラフ vol2_アーカイブ.xlsx',
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

// 2つの台帳フォルダを見て、指定時刻より後に作られた／更新されたファイル名を返す
function changedFilesSince_(since) {
  var cutoff = since.getTime() - 2 * 60 * 1000;   // 取りこぼし防止に2分の余裕を見る
  var out = [];
  [CONFIG.gokigenFolderId, CONFIG.udemyFolderId].forEach(function (id) {
    var it = DriveApp.getFolderById(id).getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (f.getLastUpdated().getTime() > cutoff) out.push(f.getName());
    }
  });
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
  var it = DriveApp.getFolderById(CONFIG.udemyFolderId).getFilesByName(CONFIG.udemyBaseName);
  return it.hasNext() ? it.next() : null;
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
  return d;
}

// ===== データ構築 =====
function buildData_(previous) {
  var health = readGokigen_();

  var dates = Object.keys(health).sort();
  var dropped = [];
  var healthArr = dates.map(function (d) { return gate_(health[d], dropped); });

  // Udemyは「Udemy台帳_base の台帳ログ」＋「Udemy台帳ログ_YYYY-MM-DD（デルタ）」の合算
  var ledger = { rows: [], courses: [], used: [] };
  try {
    ledger = readUdemyLedger_();
  } catch (e) {
    Logger.log('⚠️ Udemy台帳を読めませんでした（前回の内容を維持します）: ' + e);
  }
  var u = buildUdemy_(ledger, previous);

  var base = findUdemyBase_();

  return {
    generatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    version: '1.1',
    source: {
      gokigenFolderId: CONFIG.gokigenFolderId,
      udemyFolderId: CONFIG.udemyFolderId,
      rule: '全ファイルを読み、重複したら新しいファイルを優先',
      udemyFiles: ledger.used
    },
    updateHours: CONFIG.updateHours,
    udemyBaseUrl: base ? base.getUrl() : ((previous && previous.udemyBaseUrl) || null),
    qualityDropped: dropped,
    health: healthArr,
    udemyCourses: u.courses,
    udemy: u.snapshots,
    udemyMonthly: u.monthly
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

// 古い順にファイルを返す（後から読んだもので上書き = 新しいファイル優先）
function filesOldestFirst_(folderId) {
  var it = DriveApp.getFolderById(folderId).getFiles();
  var list = [];
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType() !== MimeType.GOOGLE_SHEETS) continue; // スプレッドシート以外は無視
    list.push({ file: f, t: f.getLastUpdated().getTime() });
  }
  list.sort(function (a, b) { return a.t - b.t; });
  return list.map(function (x) { return x.file; });
}

// ===== GOKIGEN台帳 =====
function readGokigen_() {
  var out = {};
  filesOldestFirst_(CONFIG.gokigenFolderId).forEach(function (file) {
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
  });
  // 内部フラグを外す
  Object.keys(out).forEach(function (d) { delete out[d]._ok; });
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
  cumRevenue:  ['累計収益'],          // 「累計収益(USD)」「累計収益USD」も正規化すると同じになる
  rating:      ['評価'],
  src:         ['出所']
};

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
  var out = [];
  for (var i = hd.row + 1; i < values.length; i++) {
    var row = values[i];
    var cell = function (f) { var c = hd.map[f]; return c == null ? null : row[c]; };
    var date = toDate_(cell('date')), id = str_(cell('id'));
    if (!date || !id) continue;
    out.push({
      date:        date,
      time:        timeStr_(cell('time')),
      id:          id,
      name:        str_(cell('name')),
      published:   ymStr_(cell('published')),
      cumEnroll:   num_(cell('cumEnroll')),
      monthEnroll: num_(cell('monthEnroll')),
      cumRevenue:  money_(cell('cumRevenue')),
      rating:      num_(cell('rating')),
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
  var byKey = {}, courses = [], used = [];
  udemySources_().forEach(function (s) {
    var ss;
    try { ss = SpreadsheetApp.openById(s.file.getId()); }
    catch (e) { Logger.log('読めませんでした: ' + s.name + ' / ' + e); return; }

    // base は「台帳ログ」シート。デルタ／旧スナップショットは1枚目。
    var sheet = (s.rank === LEDGER_RANK.base) ? ss.getSheetByName('台帳ログ') : ss.getSheets()[0];
    if (!sheet) { Logger.log('「台帳ログ」シートがありません: ' + s.name); return; }

    var rows = readLedgerSheet_(sheet, s.name);
    rows.forEach(function (r) {
      var k = r.date + '|' + r.id;
      byKey[k] = mergeLedger_(byKey[k], r);
    });
    used.push({ name: s.name, rows: rows.length });

    if (s.rank === LEDGER_RANK.base) {
      var mst = ss.getSheetByName('コースマスタ');
      if (mst) {
        mst.getDataRange().getValues().slice(1).forEach(function (r) {
          if (!str_(r[0])) return;
          courses.push({ id: str_(r[0]), short: str_(r[1]), published: ymStr_(r[3]), title: str_(r[4]) });
        });
      }
    }
  });
  var rows = Object.keys(byKey).sort().map(function (k) { return byKey[k]; });
  return { rows: rows, courses: courses, used: used };
}

// 同じ記録日×コースIDがぶつかったとき。強い（後から読んだ）方を採用し、空欄だけ弱い方で埋める。
function mergeLedger_(prev, next) {
  if (!prev) return next;
  ['time','name','published','cumEnroll','monthEnroll','cumRevenue','rating','src'].forEach(function (f) {
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
  var ids = courses.map(function (c) { return c.id; });

  // スナップショット（直近だけ。全部入れるとdata.jsonが肥大するため）
  var snapshots = dates.slice(-CONFIG.snapshotLimit).map(function (d) {
    var list = byDate[d].slice().sort(byId_);
    return {
      date: d,
      time: (list[0] && list[0].time) || null,
      rows: list.map(function (r) {
        return { id: r.id, cumEnroll: r.cumEnroll, monthEnroll: r.monthEnroll,
                 cumRevenue: r.cumRevenue, rating: r.rating };
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
    monthly.push({
      ym: ym, enroll: Math.round(te), newEnroll: newEnroll, revenue: round2_(tr),
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
function timeStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'H:mm');
  return str_(v);
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
