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
  udemyXlsxId:     '1T7SE-LrYr4gtTxvyGkBDgNZ_4ruTnvJv', // Udemyグラフ vol2.xlsx（2021年10月〜の日次履歴）
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

// GitHubトークンは「スクリプト プロパティ」に GITHUB_TOKEN という名前で保存します（コードに直接書かない）
function getToken_() {
  var t = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!t) throw new Error('GITHUB_TOKEN が未設定です。プロジェクトの設定 → スクリプト プロパティ に追加してください。');
  return t;
}

// ===== メイン =====
function main() {
  var previous = fetchCurrentJson_();          // 失敗時のフォールバック用に、今公開中のdata.jsonを取得
  var data = buildData_(previous);
  var json = JSON.stringify(data, null, 2) + '\n';
  var result = pushToGitHub_(json, previous);
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
  var d = buildData_(fetchCurrentJson_());
  Logger.log('健康データ: ' + d.health.length + '日分 (' +
    d.health[0].date + ' 〜 ' + d.health[d.health.length - 1].date + ')');
  var w = d.health.filter(function (r) { return r.weight != null; });
  Logger.log('体重: ' + w.length + '点  ' + w[0].weight + 'kg → ' + w[w.length - 1].weight + 'kg');
  Logger.log('Udemyスナップショット: ' + d.udemy.length + '件');
  Logger.log('Udemy月次履歴: ' + (d.udemyMonthly ? d.udemyMonthly.length + 'ヶ月 (' +
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
  var udemy  = readUdemy_();

  var dates = Object.keys(health).sort();
  var dropped = [];
  var healthArr = dates.map(function (d) { return gate_(health[d], dropped); });

  var uDates = Object.keys(udemy).sort();
  var udemyArr = uDates.map(function (d) {
    var snap = udemy[d];
    var ids = Object.keys(snap.rows).sort();
    return { date: d, time: snap.time, rows: ids.map(function (id) { return snap.rows[id]; }) };
  });

  // 5年分の履歴とコースマスタ（xlsxが読めなければ、今公開中のdata.jsonの内容を引き継ぐ）
  var hist = null;
  try {
    hist = readUdemyHistory_();
  } catch (e) {
    Logger.log('⚠️ Udemy履歴ファイルを読めませんでした（前回の内容を維持します）: ' + e);
  }
  var monthly = (hist && hist.monthly.length) ? hist.monthly
              : (previous && previous.udemyMonthly) ? previous.udemyMonthly : [];

  // コース一覧はコースマスタを正とし、無ければスナップショットから作る
  var courses = [];
  if (hist && hist.courses.length) {
    courses = hist.courses;
  } else if (previous && previous.udemyCourses) {
    courses = previous.udemyCourses;
  } else if (udemyArr.length) {
    var latest = udemy[uDates[uDates.length - 1]];
    Object.keys(latest.names).sort().forEach(function (id) {
      courses.push({ id: id, short: shortName_(latest.names[id]), published: latest.published[id] || null });
    });
  }

  return {
    generatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    version: '1.1',
    source: {
      gokigenFolderId: CONFIG.gokigenFolderId,
      udemyFolderId: CONFIG.udemyFolderId,
      udemyXlsxId: CONFIG.udemyXlsxId,
      rule: '全ファイルを読み、日付が重複したら新しいファイルを優先'
    },
    qualityDropped: dropped,
    health: healthArr,
    udemyCourses: courses,
    udemy: udemyArr,
    udemyMonthly: monthly
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

// ===== STEP4: Udemyの5年分履歴（xlsx）=====
/**
 * 「Udemyグラフ vol2.xlsx」の「台帳ログ」「コースマスタ」を読む。
 * xlsxのままでは読めないので、一時的にGoogleスプレッドシートへ変換して読み、最後に捨てる。
 * ダッシュボード等の #REF! シートには触らない。
 */
function readUdemyHistory_() {
  var tempId = null;
  try {
    var res = UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + CONFIG.udemyXlsxId + '/copy?supportsAllDrives=true',
      { method: 'post',
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        contentType: 'application/json',
        payload: JSON.stringify({ name: '_tmp_udemy_history', mimeType: MimeType.GOOGLE_SHEETS }),
        muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      throw new Error('変換に失敗: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
    }
    tempId = JSON.parse(res.getContentText()).id;

    var ss = SpreadsheetApp.openById(tempId);
    var logSheet = ss.getSheetByName('台帳ログ');
    var mstSheet = ss.getSheetByName('コースマスタ');
    if (!logSheet) throw new Error('「台帳ログ」シートが見つかりません');

    var courses = [];
    if (mstSheet) {
      mstSheet.getDataRange().getValues().slice(1).forEach(function (r) {
        if (!str_(r[0])) return;
        courses.push({ id: str_(r[0]), short: str_(r[1]), published: ymStr_(r[3]), title: str_(r[4]) });
      });
    }

    // 台帳ログ: 記録日, コースID, 累計登録, 累計収益(USD), 評価, 出所
    var byMonth = {};   // ym -> { コースID -> {e,r} }
    logSheet.getDataRange().getValues().slice(1).forEach(function (r) {
      var d = toDate_(r[0]), id = str_(r[1]);
      if (!d || !id) return;
      var ym = d.slice(0, 7);
      if (!byMonth[ym]) byMonth[ym] = {};
      if (!byMonth[ym][id]) byMonth[ym][id] = {};
      var e = num_(r[2]), rv = money_(r[3]);
      if (e != null) byMonth[ym][id].e = e;    // その月の最後の値が残る
      if (rv != null) byMonth[ym][id].r = rv;
    });

    var yms = Object.keys(byMonth).sort();
    if (!yms.length) return { monthly: [], courses: courses };
    var ids = courses.length ? courses.map(function (c) { return c.id; }) : uniqueIds_(byMonth);

    var monthly = [], cur = {};
    ids.forEach(function (id) { cur[id] = { e: null, r: null }; });
    eachMonth_(yms[0], yms[yms.length - 1]).forEach(function (ym) {
      ids.forEach(function (id) {
        var v = byMonth[ym] && byMonth[ym][id];
        if (v) { if (v.e != null) cur[id].e = v.e; if (v.r != null) cur[id].r = v.r; }
      });
      var te = 0, tr = 0, byCourse = {};
      ids.forEach(function (id) {
        if (cur[id].e != null) te += cur[id].e;
        if (cur[id].r != null) tr += cur[id].r;
        byCourse[id] = { enroll: cur[id].e, revenue: cur[id].r == null ? null : round2_(cur[id].r) };
      });
      monthly.push({ ym: ym, enroll: Math.round(te), revenue: round2_(tr), byCourse: byCourse });
    });
    return { monthly: monthly, courses: courses };

  } finally {
    if (tempId) { try { DriveApp.getFileById(tempId).setTrashed(true); } catch (e) {} }
  }
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
