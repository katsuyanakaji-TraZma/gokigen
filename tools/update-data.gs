/**
 * GOKIGEN OS — data.json 自動生成スクリプト（Google Apps Script）
 *
 * やること：
 *   1. Googleドライブの「GOKIGEN台帳」「Udemy台帳」フォルダの全ファイルを読む
 *   2. 全期間を1つに統合する（日付が重複したら「新しいファイル」を優先）
 *   3. GitHub の katsuyanakaji-TraZma/gokigen に data.json を書き込む
 *   4. Vercel が自動でデプロイ → アプリが最新になる
 *
 * 毎朝7時に自動実行。Google側のサーバーで動くので Mac mini の電源は関係ありません。
 *
 * 初回だけ setupTrigger() を1回実行してください（毎朝7時の予約がセットされます）。
 */

// ===== 設定 =====
var CONFIG = {
  gokigenFolderId: '1vJ7ddquLREjntkRUy235nv5FXaas2IoV',
  udemyFolderId:   '1g3hrPVRIYB_GOYho36DLRnITG_c5-elx',
  repoOwner: 'katsuyanakaji-TraZma',
  repoName:  'gokigen',
  filePath:  'data.json',
  branch:    'main'
};

// GitHubトークンは「スクリプト プロパティ」に GITHUB_TOKEN という名前で保存します（コードに直接書かない）
function getToken_() {
  var t = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!t) throw new Error('GITHUB_TOKEN が未設定です。プロジェクトの設定 → スクリプト プロパティ に追加してください。');
  return t;
}

// ===== メイン =====
function main() {
  var data = buildData_();
  var json = JSON.stringify(data, null, 2) + '\n';
  var result = pushToGitHub_(json);
  Logger.log(result);
  return result;
}

// 初回だけ実行：毎朝7時の予約をセット
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'main') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('main').timeBased().atHour(7).everyDays(1).create();
  Logger.log('毎朝7時の自動実行をセットしました（タイムゾーン: ' + Session.getScriptTimeZone() + '）');
}

// 動作確認用：GitHubに書かず、中身だけログに出す
function dryRun() {
  var d = buildData_();
  Logger.log('健康データ: ' + d.health.length + '日分 (' +
    d.health[0].date + ' 〜 ' + d.health[d.health.length - 1].date + ')');
  var w = d.health.filter(function (r) { return r.weight != null; });
  Logger.log('体重: ' + w.length + '点  ' + w[0].weight + 'kg → ' + w[w.length - 1].weight + 'kg');
  Logger.log('Udemy: ' + d.udemy.length + 'スナップショット');
  return d;
}

// ===== データ構築 =====
function buildData_() {
  var health = readGokigen_();
  var udemy  = readUdemy_();

  var dates = Object.keys(health).sort();
  var healthArr = dates.map(function (d) { return health[d]; });

  var uDates = Object.keys(udemy).sort();
  var udemyArr = uDates.map(function (d) {
    var snap = udemy[d];
    var ids = Object.keys(snap.rows).sort();
    return { date: d, time: snap.time, rows: ids.map(function (id) { return snap.rows[id]; }) };
  });

  // コース一覧は最新スナップショットから
  var courses = [];
  if (udemyArr.length) {
    var latest = udemy[uDates[uDates.length - 1]];
    Object.keys(latest.names).sort().forEach(function (id) {
      courses.push({ id: id, short: shortName_(latest.names[id]), published: latest.published[id] || null });
    });
  }

  return {
    generatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    source: {
      gokigenFolderId: CONFIG.gokigenFolderId,
      udemyFolderId: CONFIG.udemyFolderId,
      rule: '全ファイルを読み、日付が重複したら新しいファイルを優先'
    },
    health: healthArr,
    udemyCourses: courses,
    udemy: udemyArr
  };
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
      out[date] = {
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
    }
  });
  return out;
}

// ===== Udemy台帳 =====
function readUdemy_() {
  var out = {};
  filesOldestFirst_(CONFIG.udemyFolderId).forEach(function (file) {
    var values;
    try { values = SpreadsheetApp.openById(file.getId()).getSheets()[0].getDataRange().getValues(); }
    catch (e) { Logger.log('読めませんでした: ' + file.getName() + ' / ' + e); return; }

    var head = findHeader_(values, '記録日');
    if (head < 0) return;

    for (var i = head + 1; i < values.length; i++) {
      var row = values[i];
      var date = toDate_(row[0]);
      var id = str_(row[2]);
      if (!date || !id) continue;

      if (!out[date]) out[date] = { time: timeStr_(row[1]), rows: {}, names: {}, published: {} };
      out[date].time = timeStr_(row[1]) || out[date].time;
      out[date].names[id] = str_(row[3]) || out[date].names[id];
      out[date].published[id] = ymStr_(row[4]) || out[date].published[id];
      out[date].rows[id] = {
        id: id,
        cumEnroll:   num_(row[5]),
        monthEnroll: num_(row[6]),
        cumRevenue:  money_(row[7]),
        rating:      num_(row[9])
      };
    }
  });
  return out;
}

// ===== 変換ヘルパー =====
function findHeader_(values, key) {
  for (var i = 0; i < Math.min(values.length, 10); i++) {
    if (String(values[i][0]).trim() === key) return i;
  }
  return -1;
}
function toDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  var s = String(v || '').trim();
  var m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (!m) return null;
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
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
// ご機嫌度: 4 / "4/5" / "3/5(真ん中)" / "かなりよい" などを 1〜5 に寄せる
function mood_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return (v >= 1 && v <= 5) ? v : null;
  var s = String(v).trim();
  var m = s.match(/^(\d+)\s*\/\s*5/);
  if (m) return parseInt(m[1], 10);
  if (/かなりよい|とてもよい|最高/.test(s)) return 5;
  if (/よい|良い|ご機嫌/.test(s)) return 4;
  if (/ふつう|普通|真ん中/.test(s)) return 3;
  if (/わるい|悪い/.test(s)) return 2;
  var n = parseFloat(s);
  return (!isNaN(n) && n >= 1 && n <= 5) ? n : null;
}
function timeStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'H:mm');
  return str_(v);
}
function ymStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/M');
  return str_(v);
}
function shortName_(full) {
  var s = String(full || '');
  s = s.replace(/^【[^】]*】/, '').trim();
  var cut = s.split(/[　\s！!。・／\/]/)[0];
  return (cut || s).slice(0, 14);
}

// ===== GitHub =====
function pushToGitHub_(content) {
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
