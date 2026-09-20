/**
 * GOKIGEN OS v2 — 取込の門番（intake）
 *
 * 設計書「GOKIGEN OS v2 設計書 ——『間違えようがない』取り込みへの抜本改革」（2026-09-14）の
 * 第2章【層2】と第4章 STEP0〜STEP3 の実装。update-data.gs と**同じ Apps Script プロジェクト**に置く。
 *
 * この1本がやること：
 *   1. Drive「📥_取込箱」を見る（台帳フォルダ直下には何も書かない／読まない）
 *   2. ファイル名・mimeType・必須キー・数値レンジを schema/<台帳>.json と突き合わせる
 *   3. OK … 台帳_base シートに追記（同じ日付が既にあれば新しい方で置き換え）→「📦_取込済」へ移動
 *      NG … 「⚠️_エラー箱」へ移動し、理由を書いた <元の名前>_エラー理由.txt を隣に置く
 *   4. 結果を必ず2か所に出す（沈黙禁止）
 *        ① Slack #gokigen-取込 に1行
 *        ② data.json の meta.intake（アプリ家画面の最上段バッジ）
 *   5. 取込箱に残ったファイルがあれば、それ自体を⚠️として meta.intake.pending に出す
 *
 * 【本人が1回だけやること】
 *   ① step0_backupLedgers()  … 台帳フォルダ全ファイルをDriveの中に複製（削除は一切しない）
 *   ② syncSchemasToDrive()   … schema/*.json をリポジトリからDriveへ配る（更新時も同じ）
 *   ③ step2_migrateV1ToBase()… 既存の日次スナップショットを各台帳_baseへ一括取込
 *   ④ スクリプト プロパティに SLACK_WEBHOOK_URL を登録（未登録でも止まらない。通知が出ないだけ）
 *
 * 新しいOAuthスコープは増えません（Drive・Spreadsheet・UrlFetch は既存のまま）。
 */

// ===== v2 設定 =====
var V2 = {
  boxName:       '📥_取込箱',
  doneName:      '📦_取込済',
  errName:       '⚠️_エラー箱',
  schemaName:    'schema',
  archiveV1Name: '_v1アーカイブ',
  backupPrefix:  '🗄_backup-v2前_',
  ledgers: ['gokigen', 'udemy', 'note', 'economy', 'limitless', 'places', 'teizan'],
  // schemaの正本はリポジトリ（schema/*.json）。Driveへはここから配る。
  schemaUrlBase: 'https://gokigen-iota.vercel.app/schema/',
  slackProp:     'SLACK_WEBHOOK_URL',
  slackChannel:  '#gokigen-取込',
  maxPerRun:     30,                 // 1回の実行で処理する上限（6分制限に当てない）
  propLastIntake: 'LAST_INTAKE'      // 直近の取込結果（JSON文字列）
};

/* =====================================================================
   ===== v2 検品（純粋関数）ここから =====
   ここから下の「ここまで」までは DriveApp / SpreadsheetApp / UrlFetchApp に
   一切触らない。tools/test/test-intake.js がこの範囲だけを切り出して検証する。
   ===================================================================== */

var V2_NAME_RE = /^intake_([a-z]+)_(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})\.json$/;
var V2_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** ファイル名を型どおりに読む。intake_<台帳>_<YYYY-MM-DD>_<HHMM>.json */
function v2ParseName_(name) {
  var m = V2_NAME_RE.exec(String(name || ''));
  if (!m) return { ok: false };
  var hh = Number(m[3]), mi = Number(m[4]);
  if (hh > 23 || mi > 59) return { ok: false };
  if (!v2ValidDate_(m[2])) return { ok: false };
  return { ok: true, ledger: m[1], date: m[2], hhmm: m[3] + ':' + m[4] };
}

/** 「2026-02-30」のような有りえない日付を弾く */
function v2ValidDate_(s) {
  if (!V2_DATE_RE.test(String(s || ''))) return false;
  var p = String(s).split('-');
  var y = Number(p[0]), m = Number(p[1]), d = Number(p[2]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  var last = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28,
              31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= last;
}

/** 空っぽ（未記入）か。0 と false は空ではない */
function v2Blank_(v) { return v === null || v === undefined || v === ''; }

/**
 * 値ひとつを型・レンジ・enum と突き合わせる。違反は errs に1行ずつ日本語で積む。
 * where … 「[3行目] 」のような場所の目印（トップレベルは空文字）
 */
function v2CheckField_(where, key, spec, val, errs, fileDate) {
  var label = spec.label || key;
  if (val === undefined) {
    if (spec.required) errs.push(where + '必須キーが無い: ' + key + '（' + label + '）');
    return;
  }
  if (v2Blank_(val)) {
    if (spec.required && !spec.nullable) {
      errs.push(where + label + '（' + key + '）が空。必ず値を書く');
    }
    return;
  }
  var t = spec.type;
  if (t === 'number' || t === 'int') {
    if (typeof val !== 'number' || !isFinite(val)) {
      errs.push(where + label + 'が数字でない: ' + JSON.stringify(val) + '（"83.1" ではなく 83.1 と書く）');
      return;
    }
    if (t === 'int' && Math.round(val) !== val) {
      errs.push(where + label + 'は整数で書く: ' + val);
      return;
    }
    if (spec.min != null && val < spec.min) {
      errs.push(where + label + 'が範囲外: ' + val + '（' + spec.min + '〜' + spec.max + '）');
      return;
    }
    if (spec.max != null && val > spec.max) {
      errs.push(where + label + 'が範囲外: ' + val + '（' + spec.min + '〜' + spec.max + '）');
      return;
    }
    return;
  }
  if (t === 'date') {
    if (typeof val !== 'string' || !v2ValidDate_(val)) {
      errs.push(where + label + 'が日付の形でない: ' + JSON.stringify(val) + '（YYYY-MM-DD）');
      return;
    }
    if (spec.sameAsFileDate && fileDate && val !== fileDate) {
      errs.push(where + label + 'がファイル名の日付と違う: ' + val + ' ≠ ' + fileDate);
    }
    return;
  }
  if (typeof val !== 'string') {
    errs.push(where + label + 'は文字で書く: ' + JSON.stringify(val));
    return;
  }
  if (t === 'enum' || spec.enum) {
    if (spec.enum.indexOf(val) < 0) {
      errs.push(where + label + 'が決められた言葉でない: ' + JSON.stringify(val) +
                '（使えるのは ' + spec.enum.join('／') + '）');
      return;
    }
  }
  if (spec.containsOneOf) {
    var hit = false;
    for (var i = 0; i < spec.containsOneOf.length; i++) {
      if (val.indexOf(spec.containsOneOf[i]) >= 0) { hit = true; break; }
    }
    if (!hit) {
      errs.push(where + label + 'に分類の言葉が無い: ' + JSON.stringify(val) +
                '（' + spec.containsOneOf.join('／') + 'のどれかを含める）');
      return;
    }
  }
  if (spec.pattern && !(new RegExp(spec.pattern)).test(val)) {
    errs.push(where + label + 'の書き方が型どおりでない: ' + JSON.stringify(val) + '（' + spec.pattern + '）');
    return;
  }
  if (spec.forbidPattern && (new RegExp(spec.forbidPattern)).test(val)) {
    errs.push(where + label + 'に使ってはいけない言葉が入っている: ' + JSON.stringify(val) +
              '（' + spec.forbidPattern.split('|').join('／') + 'の行は小計。明細だけを書く）');
    return;
  }
  if (spec.maxLen && val.length > spec.maxLen) {
    errs.push(where + label + 'が長すぎる: ' + val.length + '文字（' + spec.maxLen + '文字まで）');
  }
}

/** スキーマに無いキーが混ざっていないか（書き間違いをここで捕まえる） */
function v2CheckUnknown_(where, obj, specs, allowKeys, errs) {
  Object.keys(obj).forEach(function (k) {
    if (specs[k]) return;
    if (allowKeys && allowKeys.indexOf(k) >= 0) return;
    errs.push(where + '知らないキーが入っている: ' + k + '（schemaに無い。書き間違い？）');
  });
}

/**
 * 取込JSON1本を丸ごと検品する。
 *   name     … ファイル名
 *   mimeType … Driveが持っているmimeType（Googleドキュメントはここで落ちる）
 *   text     … 中身
 *   schema   … schema/<台帳>.json を JSON.parse したもの（null なら「見つからない」）
 * 返り値 { ok, ledger, date, hhmm, errors[], payload, rows[] }
 */
function v2Validate_(name, mimeType, text, schema) {
  var meta = v2ParseName_(name);
  if (!meta.ok) {
    return { ok: false, ledger: null, date: null, errors: [
      'ファイル名が型どおりでない: ' + name + '（正しい形は intake_<台帳>_YYYY-MM-DD_HHMM.json）'] };
  }
  var out = { ok: false, ledger: meta.ledger, date: meta.date, hhmm: meta.hhmm, errors: [] };
  if (V2.ledgers.indexOf(meta.ledger) < 0) {
    out.errors.push('知らない台帳名: ' + meta.ledger + '（使えるのは ' + V2.ledgers.join('／') + '）');
    return out;
  }
  // ① mimeType（自由文のGoogleドキュメントが素通りした9/14の事故を、ここで止める）
  if (String(mimeType) !== 'application/json') {
    out.errors.push('mimeTypeが application/json でない: ' + mimeType +
                    '（Googleドキュメント／スプレッドシートは取り込めない。.jsonファイルとして置く）');
    return out;
  }
  if (!schema) {
    out.errors.push('schema/' + meta.ledger + '.json がDriveに無い（syncSchemasToDrive() を1回実行する）');
    return out;
  }
  if (schema.fileNamePattern && !(new RegExp(schema.fileNamePattern)).test(name)) {
    out.errors.push('ファイル名がこの台帳の型と合わない: ' + name + '（' + schema.fileNamePattern + '）');
    return out;
  }
  var payload;
  try { payload = JSON.parse(text); }
  catch (e) {
    out.errors.push('JSONとして読めない: ' + (e && e.message ? e.message : e) + '（かっこやカンマの閉じ忘れ）');
    return out;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    out.errors.push('いちばん外側は { } の形で書く');
    return out;
  }
  out.payload = payload;

  // ② 必須キー・③ 数値レンジ（トップレベル）
  var fields = schema.fields || {};
  Object.keys(fields).forEach(function (k) {
    v2CheckField_('', k, fields[k], payload[k], out.errors, meta.date);
  });
  var allow = schema.shape === 'rows' ? [schema.rowsKey] : [];
  v2CheckUnknown_('', payload, fields, allow, out.errors);

  // 行のある台帳（udemy/economy/limitless/note/places/teizan）
  if (schema.shape === 'rows') {
    var arr = payload[schema.rowsKey];
    if (!Array.isArray(arr)) {
      out.errors.push('必須キーが無い: ' + schema.rowsKey + '（[ ] の配列で書く）');
    } else {
      var rc = schema.rowCount || {};
      if (rc.min != null && arr.length < rc.min) {
        out.errors.push(schema.rowsKey + 'が' + arr.length + '件。' +
          (rc.min === rc.max ? rc.min + '件ちょうど必要' : rc.min + '件以上必要'));
      }
      if (rc.max != null && arr.length > rc.max) {
        out.errors.push(schema.rowsKey + 'が' + arr.length + '件。' +
          (rc.min === rc.max ? rc.max + '件ちょうど（「全体」などの集計行が混ざっていないか）'
                             : rc.max + '件まで'));
      }
      var seen = {};
      arr.forEach(function (row, i) {
        var where = '[' + (i + 1) + '件目] ';
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          out.errors.push(where + '{ } の形で書く');
          return;
        }
        var rf = schema.rowFields || {};
        Object.keys(rf).forEach(function (k) {
          v2CheckField_(where, k, rf[k], row[k], out.errors, meta.date);
        });
        v2CheckUnknown_(where, row, rf, null, out.errors);
        if (schema.rowKey && schema.uniqueRowKey) {
          var kv = row[schema.rowKey];
          if (!v2Blank_(kv)) {
            if (seen[kv]) out.errors.push(where + schema.rowKey + 'が重なっている: ' + kv +
                                          '（' + seen[kv] + '件目と同じ）');
            else seen[kv] = i + 1;
          }
        }
      });
    }
  }

  out.ok = out.errors.length === 0;
  if (out.ok) out.rows = v2Rows_(payload, schema);
  return out;
}

/** 検品を通ったJSONを、台帳シートの「列名→値」の並びに直す */
function v2Rows_(payload, schema) {
  var base = {}, fields = schema.fields || {};
  Object.keys(fields).forEach(function (k) {
    var sp = fields[k];
    if (!sp.col) return;
    base[sp.col] = v2Cell_(payload[k], sp);
  });
  if (schema.shape !== 'rows') return [base];
  var rf = schema.rowFields || {};
  return (payload[schema.rowsKey] || []).map(function (r) {
    var o = {};
    Object.keys(base).forEach(function (c) { o[c] = base[c]; });
    Object.keys(rf).forEach(function (k) {
      var sp = rf[k];
      if (!sp.col) return;
      o[sp.col] = v2Cell_(r[k], sp);
    });
    return o;
  });
}

/* セル1つぶんの値。ご機嫌度だけは、これまでの台帳と同じ「8/10」の形にそろえる
   （読み手 mood_() が5段階と10段階を取り違えないため） */
function v2Cell_(v, sp) {
  if (v === undefined || v === null) return '';
  if (sp.colFormat === 'mood10') return v + '/10';
  return v;
}

/** シートの「日付で置き換える」か「idで置き換える」かは、スキーマの形から決まる */
function v2UpsertKey_(schema) {
  var dk = schema.dateKey, f = (schema.fields || {})[dk];
  if (f && f.col) return { by: 'date', col: f.col };
  if (schema.rowKey) {
    var rf = (schema.rowFields || {})[schema.rowKey];
    if (rf && rf.col) return { by: 'key', col: rf.col };
  }
  return { by: 'append' };
}

/** Slackに出す1行。「✅ 9/14 07:34 gokigen 83.1kg 取込OK」「❌ … NG: …」 */
function v2SlackLine_(res) {
  var when = (res.date || '').slice(5).replace('-', '/') + ' ' + (res.hhmm || '');
  var who = res.ledger || '?';
  if (res.ok) {
    return '✅ ' + when + ' ' + who + ' ' + (res.summary || '') + ' 取込OK';
  }
  return '❌ ' + when + ' ' + who + ' NG: ' + (res.errors || []).slice(0, 2).join(' / ');
}

/** 通知の「83.1kg」にあたる、ひと目で分かる要約。台帳ごとに1つだけ選ぶ */
function v2Summary_(ledger, payload, rows) {
  var n = rows ? rows.length : 0;
  if (ledger === 'gokigen') {
    if (payload && payload.weight_kg != null) return payload.weight_kg + 'kg';
    if (payload && payload.sleep_score != null) return '睡眠' + payload.sleep_score;
    return '1日分';
  }
  if (ledger === 'udemy')     return n + 'コース';
  if (ledger === 'economy')   return n + '口座';
  if (ledger === 'limitless') return n + '件';
  if (ledger === 'note')      return n + '行';
  if (ledger === 'places')    return n + 'か所';
  if (ledger === 'teizan')    return n + '座';
  return n + '行';
}

/* ===== v2 検品 ここまで ===== */

/* =====================================================================
   ===== ここから下は Drive / スプレッドシート / Slack に触る =====
   ===================================================================== */

/** GOKIGEN台帳フォルダ直下のフォルダ。無ければ作る（何度呼んでも増えない） */
function v2Folder_(name) {
  var parent = DriveApp.getFolderById(CONFIG.gokigenFolderId);
  var it = parent.getFoldersByName(name);
  while (it.hasNext()) { var f = it.next(); if (!f.isTrashed()) return f; }
  return parent.createFolder(name);
}

/** 台帳ごとの置き場所（schemaの folder に書いてある） */
function v2LedgerFolderId_(key) {
  var m = {
    gokigen:   CONFIG.gokigenFolderId,
    udemy:     CONFIG.udemyFolderId,
    limitless: CONFIG.limitlessFolderId,
    eco:       CONFIG.ecoFolderId
  };
  return m[key] || CONFIG.gokigenFolderId;
}

function v2Today_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}
function v2Now_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
}

/** Drive の schema フォルダから schema/<台帳>.json を読む（1回の実行で1台帳1回だけ読む） */
function v2Schema_(ledger, cache) {
  if (cache && cache[ledger] !== undefined) return cache[ledger];
  var out = null;
  try {
    var f = fileInFolder_(v2Folder_(V2.schemaName), ledger + '.json');
    if (f) out = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
  } catch (e) {
    Logger.log('schema/' + ledger + '.json が読めません: ' + e);
  }
  if (cache) cache[ledger] = out;
  return out;
}

/**
 * スキーマの正本はリポジトリ（schema/*.json）。ここからDriveへ配る。
 * スキーマを直したときは、pushしたあとにこれを1回実行する。
 */
function syncSchemasToDrive() {
  var folder = v2Folder_(V2.schemaName);
  var done = [], ng = [];
  V2.ledgers.forEach(function (led) {
    var url = V2.schemaUrlBase + led + '.json';
    try {
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) { ng.push(led + '(' + res.getResponseCode() + ')'); return; }
      var text = res.getContentText();
      JSON.parse(text);                                     // 壊れたJSONを配らない
      var old = fileInFolder_(folder, led + '.json');
      if (old) old.setTrashed(true);
      folder.createFile(led + '.json', text, 'application/json');
      done.push(led);
    } catch (e) { ng.push(led + '(' + e + ')'); }
  });
  var msg = 'schema配布: OK ' + done.join('/') + (ng.length ? ' ／ NG ' + ng.join('/') : '');
  Logger.log(msg);
  return msg;
}

/** 列名 → その列のスキーマ定義。セルの守り方（数式よけ）を決めるのに使う */
function v2ColSpecs_(schema) {
  var m = {};
  [schema.fields, schema.rowFields].forEach(function (g) {
    if (!g) return;
    Object.keys(g).forEach(function (k) { if (g[k].col) m[g[k].col] = g[k]; });
  });
  return m;
}

/** 台帳_base を作るときの列の並び */
function v2HeadOrder_(schema) {
  var out = [];
  [schema.fields, schema.rowFields].forEach(function (g) {
    if (!g) return;
    Object.keys(g).forEach(function (k) { if (g[k].col && out.indexOf(g[k].col) < 0) out.push(g[k].col); });
  });
  return out;
}

/** 見出しを探すために、シートの上から10行だけ読む（全部読むと重い） */
function v2SheetHead_(sh) {
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (!lastRow || !lastCol) return [];
  return sh.getRange(1, 1, Math.min(10, lastRow), lastCol).getValues();
}

/**
 * 台帳ファイルの中から「行が並んでいるシート」を選ぶ。
 * **1枚目とは限らない**。Udemy台帳_base の1枚目は「ダッシュボード」で、台帳の実体は
 * 「台帳ログ」シート。1枚目に書き込むとダッシュボードを壊す（既存の readUdemyLedger_ も
 * getSheetByName('台帳ログ') で開いている。同じ見分け方にそろえる）。
 *   ① schemaの sheetTab で名前の指定があり、そのシートの見出しが合えば、それを使う
 *   ② 合わなければ、欲しい列がいちばん多く並んでいるシート
 *   ③ ただし**キー列（記録日など）が見つからないシートは選ばない**（ダッシュボードを掴まないため）
 * 返り値 { sheet, name, headRow, headers, idx, width } / 見つからなければ null
 */
function v2OpenLedger_(ss, cols, keyCols, aliases, preferName) {
  var cand = [];
  ss.getSheets().forEach(function (sh) {
    var head = v2SheetHead_(sh);
    if (!head.length) return;
    var hr = v2HeadRow_(head, cols);
    if (hr < 0) return;
    var headers = head[hr].slice();
    var idx = {}, hit = 0, keyOk = true;
    cols.forEach(function (c) {
      var i = v2FindCol_(headers, c, (aliases || {})[c]);
      idx[c] = i;
      if (i >= 0) hit++;
    });
    (keyCols || []).forEach(function (c) { if (!(idx[c] >= 0)) keyOk = false; });
    cand.push({ sheet: sh, name: sh.getName(), headRow: hr, headers: headers,
                idx: idx, width: headers.length, hit: hit, keyOk: keyOk });
  });
  var ok = cand.filter(function (c) { return c.keyOk; });
  if (preferName) {
    for (var i = 0; i < ok.length; i++) if (ok[i].name === preferName) return ok[i];
  }
  ok.sort(function (a, b) { return b.hit - a.hit; });
  return ok.length ? ok[0] : null;
}

/** 見つからなかった列を見出しの**右端**に足す（既にある列はずらさない＝既存データは動かない） */
function v2AddCols_(found, cols) {
  var added = [];
  cols.forEach(function (c) {
    if (found.idx[c] >= 0) return;
    found.idx[c] = found.width;
    found.sheet.getRange(found.headRow + 1, found.width + 1).setValue(c);
    found.headers.push(c);
    found.width++;
    added.push(c);
  });
  if (added.length) Logger.log('台帳に列を足しました: ' + found.name + ' / ' + added.join('・'));
  return added;
}

/** 見出しをそのまま使う台帳を、新しく1枚作ったときの形 */
function v2FreshFound_(sh, head) {
  sh.getRange(1, 1, 1, head.length).setValues([head]);
  var m = {};
  head.forEach(function (c, i) { m[c] = i; });
  return { sheet: sh, name: sh.getName(), headRow: 0, headers: head.slice(), idx: m, width: head.length };
}

/** 台帳_base を開く。無ければ見出しつきで作る */
function v2OpenBase_(schema) {
  var folder = DriveApp.getFolderById(v2LedgerFolderId_(schema.folder));
  var need = v2HeadOrder_(schema);
  var specs = v2ColSpecs_(schema);
  var aliases = {};
  need.forEach(function (c) { aliases[c] = (specs[c] || {}).colAliases; });
  var up = v2UpsertKey_(schema);
  var keyCols = (up.by === 'append') ? [] : [up.col];

  var f = fileInFolder_(folder, schema.sheetName);
  if (f) {
    var ss = SpreadsheetApp.openById(f.getId());
    var found = v2OpenLedger_(ss, need, keyCols, aliases, schema.sheetTab);
    if (found) { v2AddCols_(found, need); return found; }
    // 見出しが見つからない。空のシートなら見出しを書く。中身があるなら**触らない**
    var sh0 = (schema.sheetTab && ss.getSheetByName(schema.sheetTab)) || ss.getSheets()[0];
    if (sh0.getLastRow() > 0) {
      throw new Error(schema.sheetName + ' に、この台帳の見出し（' + keyCols.join('・') +
                      '）が見つかりません。step2_checkLedgers() でシートと見出しを確かめてください');
    }
    return v2FreshFound_(sh0, need);
  }
  var nss = SpreadsheetApp.create(schema.sheetName);
  moveFile_(DriveApp.getFileById(nss.getId()), folder);
  Logger.log('台帳を新しく作りました: ' + schema.sheetName);
  return v2FreshFound_(nss.getSheets()[0], need);
}

/** 見出し行を探す（欲しい列名がいちばん多く並んでいる行） */
function v2HeadRow_(values, want) {
  var best = -1, bestHit = 0;
  for (var i = 0; i < Math.min(values.length, 10); i++) {
    var norm = values[i].map(normHead_);
    var hit = 0;
    want.forEach(function (c) { if (norm.indexOf(normHead_(c)) >= 0) hit++; });
    if (hit > bestHit) { bestHit = hit; best = i; }
  }
  return bestHit ? best : -1;
}

/**
 * 台帳の見出しの中から、欲しい列がどこにあるかを探す。
 *   ① 見出しそのものが一致（normHead_ で空白・かっこ・USBの表記ゆれは吸収ずみ）
 *   ② 別名（colAliases）で一致
 *   ③ どちらかがどちらかの書き出しになっている（「関連(教えは誰に)」⊃「関連」、「口座」⊂「口座/資産名」）
 * 見つからなければ -1 を返し、呼んだ側が見出しの右端に新しい列を足す（黙って捨てない）。
 */
function v2FindCol_(headers, col, aliases) {
  var norm = headers.map(normHead_);
  var want = normHead_(col);
  var i = norm.indexOf(want);
  if (i >= 0) return i;
  var list = [want];
  (aliases || []).forEach(function (a) { list.push(normHead_(a)); });
  for (var a = 0; a < list.length; a++) {
    var w = list[a];
    if (!w) continue;
    for (var c = 0; c < norm.length; c++) {
      if (!norm[c]) continue;
      if (norm[c].indexOf(w) === 0 || w.indexOf(norm[c]) === 0) return c;
    }
  }
  return -1;
}

/** セルを書くときの守り。自由記入とご機嫌度だけ safeText_（日付に化けるのを防ぐ） */
function v2SafeCell_(spec, v) {
  if (!spec) return safeCell_(v);
  if (spec.colFormat === 'mood10') return safeText_(v);
  if (spec.type === 'string' || spec.type === 'enum') return safeText_(v);
  return safeCell_(v);
}

/**
 * 検品を通った行を台帳_baseに書く。
 *   ・同じ日付（または同じid）の行が既にあれば消してから足す＝**新しい方が正本**
 *   ・スキーマに増えた列は、見出しの右端に自動で足す（黙って捨てない）
 * 返り値 { sheet, added, replaced }
 */
function v2AppendToBase_(schema, rows, dateStr) {
  if (!rows || !rows.length) return { sheet: schema.sheetName, added: 0, replaced: 0 };
  var base = v2OpenBase_(schema);
  var sh = base.sheet, idx = base.idx, width = base.width, headRow = base.headRow;
  var specs = v2ColSpecs_(schema);

  // 同じ日付（id）の古い行を消す＝同日2回投入なら新しい方が正本
  var up = v2UpsertKey_(schema), replaced = 0;
  if (up.by !== 'append' && idx[up.col] >= 0) {
    var col = idx[up.col];
    var values = sh.getDataRange().getValues();
    var keys = null;
    if (up.by === 'key') {
      keys = {};
      rows.forEach(function (r) { keys[String(r[up.col]).trim()] = 1; });
    }
    for (var r = values.length - 1; r > headRow; r--) {
      var cell = values[r][col];
      var hit = (up.by === 'date') ? (toDate_(cell) === dateStr)
                                   : !!(keys && keys[String(cell).trim()]);
      if (!hit) continue;
      sh.deleteRow(r + 1);
      replaced++;
    }
  }

  var out = rows.map(function (rec) {
    var line = [];
    for (var i = 0; i < width; i++) line.push('');
    Object.keys(rec).forEach(function (c) {
      var i = idx[c];
      if (i != null) line[i] = v2SafeCell_(specs[c], rec[c]);
    });
    return line;
  });
  sh.getRange(sh.getLastRow() + 1, 1, out.length, width).setValues(out);
  SpreadsheetApp.flush();
  return { sheet: schema.sheetName + '［' + base.name + '］', added: out.length, replaced: replaced };
}

/** Slack #gokigen-取込 へ。webhookが未登録でも**止めない**（通知が出ないことは記録に残す） */
function v2Slack_(lines) {
  var text = (lines || []).join('\n');
  if (!text) return 'なし';
  var url = PropertiesService.getScriptProperties().getProperty(V2.slackProp);
  if (!url) { Logger.log('Slack未設定（' + V2.slackProp + '）:\n' + text); return '未設定'; }
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ text: text }), muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code !== 200) { Logger.log('Slack送信NG(' + code + '): ' + res.getContentText()); return 'NG' + code; }
    return 'OK';
  } catch (e) { Logger.log('Slack送信で例外: ' + e); return 'NG'; }
}

/** 取込箱にいま残っているファイル（＝まだ台帳に入っていない） */
function v2Pending_(box) {
  var out = [], it = box.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    out.push({ name: f.getName(), at: Utilities.formatDate(f.getLastUpdated(), 'Asia/Tokyo', 'MM/dd HH:mm') });
  }
  return out;
}

/**
 * 取込箱をひととおり処理する。**沈黙しない**のがこの関数の仕事。
 * 何も無い日でも「🈳 取込箱は空」をSlackに出す（来ない日があれば、それ自体が異常）。
 */
function runIntake_() {
  var box = v2Folder_(V2.boxName), done = v2Folder_(V2.doneName), errBox = v2Folder_(V2.errName);
  var files = [], it = box.getFiles();
  while (it.hasNext()) { var f = it.next(); if (!f.isTrashed()) files.push(f); }
  // 名前順＝日付・時刻順。同じ日に2回投入されたら、あとの時刻のファイルが後に処理される＝新しい方が正本
  files.sort(function (a, b) { return a.getName() < b.getName() ? -1 : a.getName() > b.getName() ? 1 : 0; });

  var cache = {}, results = [], lines = [];
  files.slice(0, V2.maxPerRun).forEach(function (f) {
    var name = f.getName(), mime = f.getMimeType(), text = '';
    var meta = v2ParseName_(name);
    var schema = (meta.ok && V2.ledgers.indexOf(meta.ledger) >= 0) ? v2Schema_(meta.ledger, cache) : null;
    if (mime === 'application/json') {
      try { text = f.getBlob().getDataAsString('UTF-8'); }
      catch (e) { text = ''; }
    }
    var res = v2Validate_(name, mime, text, schema);
    res.file = name;
    if (res.ok) {
      try {
        res.wrote = v2AppendToBase_(schema, res.rows, res.date);
        res.summary = v2Summary_(res.ledger, res.payload, res.rows);
        moveFile_(f, done);
      } catch (e) {
        res.ok = false;
        res.errors = ['台帳への書き込みで失敗: ' + e];
      }
    }
    if (!res.ok) {
      try {
        errBox.createFile(name.replace(/\.json$/, '') + '_エラー理由.txt',
          ['取込NG ' + v2Now_(), 'ファイル: ' + name, 'mimeType: ' + mime, '',
           '理由:'].concat(res.errors.map(function (x, i) { return (i + 1) + '. ' + x; }))
          .concat(['', '直し方: 正しい形は schema/' + (res.ledger || '<台帳>') +
                   '.json の example を見る。直したJSONを 📥_取込箱 に置き直せば、次の実行で取り込まれます。'])
          .join('\n'), MimeType.PLAIN_TEXT);
        moveFile_(f, errBox);
      } catch (e) { Logger.log('エラー箱への移動で失敗: ' + name + ' / ' + e); }
    }
    delete res.payload;                                  // 記録に中身までは残さない
    delete res.rows;
    results.push(res);
    lines.push(v2SlackLine_(res));
  });

  var pending = v2Pending_(box);
  if (!results.length) {
    lines.push('🈳 ' + v2Now_() + ' 取込箱は空（処理0件）');
  }
  if (pending.length) {
    lines.push('⚠️ ' + v2Now_() + ' 取込箱に' + pending.length + '件残っています: ' +
               pending.map(function (p) { return p.name; }).slice(0, 5).join(' / '));
  }
  var slack = v2Slack_(lines);
  var summary = {
    at: v2Now_(),
    slack: slack,
    ok: results.filter(function (r) { return r.ok; }).length,
    ng: results.filter(function (r) { return !r.ok; }).length,
    results: results.map(function (r) {
      return { file: r.file, ledger: r.ledger, date: r.date, hhmm: r.hhmm,
               ok: r.ok, summary: r.summary || '', wrote: r.wrote || null,
               errors: r.ok ? [] : r.errors };
    }),
    pending: pending
  };
  try { PropertiesService.getScriptProperties().setProperty(V2.propLastIntake, JSON.stringify(summary)); }
  catch (e) { Logger.log('取込結果の保存に失敗: ' + e); }
  Logger.log('取込: OK' + summary.ok + ' / NG' + summary.ng + ' / 残' + pending.length + '（Slack ' + slack + '）');
  return summary;
}

/** 手で今すぐ取り込みたいとき */
function runIntakeNow() { return JSON.stringify(runIntake_(), null, 2); }

/**
 * data.json の meta.intake。アプリ家画面の最上段バッジはこれだけを読む。
 * 取込が走っていなくても、取込箱に残っているファイルは**必ず**ここに出る。
 */
function v2IntakeMeta_() {
  var last = null;
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(V2.propLastIntake);
    if (raw) last = JSON.parse(raw);
  } catch (e) { Logger.log('取込結果が読めません: ' + e); }
  var pending = [];
  try { pending = v2Pending_(v2Folder_(V2.boxName)); } catch (e) { Logger.log('取込箱が見られません: ' + e); }
  var results = (last && last.results) || [];
  var okLedgers = [], ngLedgers = [];
  results.forEach(function (r) {
    var who = r.ledger || '?';
    if (r.ok) { if (okLedgers.indexOf(who) < 0) okLedgers.push(who); }
    else      { if (ngLedgers.indexOf(who) < 0) ngLedgers.push(who); }
  });
  return {
    at: last ? last.at : null,
    slack: last ? last.slack : null,
    ok: okLedgers,
    ng: ngLedgers,
    errors: results.filter(function (r) { return !r.ok; })
                   .map(function (r) { return { file: r.file, ledger: r.ledger, why: (r.errors || [])[0] || '' }; }),
    pending: pending,
    boxUrl: 'https://drive.google.com/drive/folders/' + (function () {
      try { return v2Folder_(V2.boxName).getId(); } catch (e) { return ''; }
    })()
  };
}

/* =====================================================================
   ===== STEP0: 台帳フォルダのバックアップ（コピーするだけ。削除しない） =====
   ===================================================================== */

/**
 * 台帳フォルダの全ファイルを、Driveの中に丸ごと複製する。
 *   ・元のファイルには一切触らない（コピーを作るだけ・削除も改名もしない）
 *   ・同じ名前のコピーが既にあれば飛ばすので、**何度実行しても増えない／続きから再開できる**
 *   ・5分たったら安全のため中断する。その場合はもう一度実行すれば続きから進む
 */
function step0_backupLedgers() {
  var started = new Date().getTime();
  var root = v2Folder_(V2.backupPrefix + v2Today_());
  var targets = [
    { key: 'GOKIGEN台帳',     id: CONFIG.gokigenFolderId },
    { key: 'Udemy台帳',       id: CONFIG.udemyFolderId },
    { key: 'リミットレス台帳', id: CONFIG.limitlessFolderId },
    { key: '経済台帳',        id: CONFIG.ecoFolderId }
  ];
  var copied = 0, skipped = 0, failed = 0, rest = false;
  var manifest = ['GOKIGEN OS v2 バックアップ ' + v2Now_(), ''];

  for (var t = 0; t < targets.length && !rest; t++) {
    var src = DriveApp.getFolderById(targets[t].id);
    var dstIt = root.getFoldersByName(targets[t].key);
    var dst = dstIt.hasNext() ? dstIt.next() : root.createFolder(targets[t].key);
    var have = {};
    var hit = dst.getFiles();
    while (hit.hasNext()) have[hit.next().getName()] = 1;

    manifest.push('■ ' + targets[t].key + '（' + targets[t].id + '）');
    var it = src.getFiles();
    while (it.hasNext()) {
      if (new Date().getTime() - started > 5 * 60 * 1000) { rest = true; break; }
      var f = it.next();
      if (f.isTrashed()) continue;
      var nm = f.getName();
      manifest.push('  ' + nm + '  [' + f.getId() + ']');
      if (have[nm]) { skipped++; continue; }
      try { f.makeCopy(nm, dst); copied++; }
      catch (e) { failed++; Logger.log('コピーできません: ' + nm + ' / ' + e); }
    }
  }
  try {
    var mf = fileInFolder_(root, '_バックアップ一覧.txt');
    if (mf) mf.setTrashed(true);
    root.createFile('_バックアップ一覧.txt', manifest.join('\n'), MimeType.PLAIN_TEXT);
  } catch (e) { Logger.log('一覧が書けません: ' + e); }

  var msg = 'STEP0 バックアップ: 複製' + copied + '件 / 済み' + skipped + '件 / 失敗' + failed + '件' +
            (rest ? ' … 時間切れ。もう一度 step0_backupLedgers() を実行すると続きから進みます'
                  : ' … 完了（' + root.getName() + '）');
  Logger.log(msg);
  return msg;
}

/* =====================================================================
   ===== STEP2: 既存の日次スナップショットを各台帳_baseへ一括取込 =====
   ===================================================================== */

/** 行の見分け札。日付の列は書き方のゆれ（Date型・2026/9/5）を吸収してから並べる */
function v2Sig_(row, idx, keyCols) {
  var parts = [];
  for (var i = 0; i < keyCols.length; i++) {
    var c = idx[keyCols[i]];
    if (c == null || c < 0) return '';
    var v = row[c];
    if (v === '' || v === null || v === undefined) return '';
    var d = toDate_(v);
    parts.push(d ? d : String(v).trim());
  }
  return parts.join('|');
}

/**
 * 日次ログ（…ログ_YYYY-MM-DD）を台帳_baseへ一括取込する。
 *   ・**足すだけ**。baseに既にある行（同じ見分け札）は触らない＝何度実行しても二重にならない
 *   ・取り込み終わったログは「_v1アーカイブ」へ移す（削除はしない）
 */
function v2Migrate_(cfg) {
  var folder = DriveApp.getFolderById(cfg.folderId);
  var baseFile = fileInFolder_(folder, cfg.baseName);
  var found;
  if (baseFile) {
    var ss = SpreadsheetApp.openById(baseFile.getId());
    /* **1枚目とは限らない**。Udemy台帳_base の1枚目はダッシュボードで、
       台帳の実体は「台帳ログ」シート。中身を見てシートを選ぶ。 */
    found = v2OpenLedger_(ss, cfg.head, cfg.key, cfg.alias || {}, cfg.sheetTab);
    if (!found) {
      var sh0 = (cfg.sheetTab && ss.getSheetByName(cfg.sheetTab)) || ss.getSheets()[0];
      if (sh0.getLastRow() > 0) {
        return { label: cfg.label, ok: false,
                 msg: cfg.baseName + ': キーの列（' + cfg.key.join('・') + '）が見つかりません。' +
                      'step2_checkLedgers() でシートと見出しを確かめてください（中身は触っていません）' };
      }
      found = v2FreshFound_(sh0, cfg.head);
    }
  } else {
    var nss = SpreadsheetApp.create(cfg.baseName);
    moveFile_(DriveApp.getFileById(nss.getId()), folder);
    Logger.log('台帳を新しく作りました: ' + cfg.baseName);
    found = v2FreshFound_(nss.getSheets()[0], cfg.head);
  }
  /* 台帳に無い列（経済台帳の「通貨」など）は見出しの右端に足す。
     **ここで諦めない**——列が1つ無いだけで移行を止めると、数字が入らないまま黙って止まる。 */
  var addedCols = v2AddCols_(found, cfg.head);
  var sh = found.sheet, headers = found.headers, idxBase = found.idx, headRow = found.headRow;
  var values = sh.getDataRange().getValues();

  var have = {}, before = 0;
  for (var r = headRow + 1; r < values.length; r++) {
    var sig = v2Sig_(values[r], idxBase, cfg.key);
    if (!sig) continue;
    if (!have[sig]) before++;
    have[sig] = 1;
  }

  var logs = [], it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    if (f.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;
    if (!cfg.logRe.test(f.getName())) continue;
    logs.push(f);
  }
  logs.sort(function (a, b) { return a.getLastUpdated().getTime() - b.getLastUpdated().getTime(); });

  var add = {}, order = [], readFiles = 0, skipped = 0;
  logs.forEach(function (f) {
    var vals;
    try { vals = SpreadsheetApp.openById(f.getId()).getSheets()[0].getDataRange().getValues(); }
    catch (e) { Logger.log('読めません: ' + f.getName() + ' / ' + e); return; }
    var hr = v2HeadRow_(vals, cfg.head);
    if (hr < 0) { Logger.log('見出しが見つかりません（飛ばします）: ' + f.getName()); return; }
    var idxSrc = {};
    cfg.head.forEach(function (c) { idxSrc[c] = v2FindCol_(vals[hr], c, (cfg.alias || {})[c]); });
    for (var r = hr + 1; r < vals.length; r++) {
      var line = [];
      for (var i = 0; i < found.width; i++) line.push('');
      cfg.head.forEach(function (c) {
        if (idxSrc[c] < 0 || idxBase[c] < 0) return;
        line[idxBase[c]] = vals[r][idxSrc[c]];
      });
      var sig = v2Sig_(line, idxBase, cfg.key);
      if (!sig) continue;
      if (have[sig]) { skipped++; continue; }              // baseに既にある＝触らない
      if (!add[sig]) order.push(sig);
      add[sig] = line;                                     // 同じ札なら、あとで読んだ（新しい）ファイルが勝つ
    }
    readFiles++;
  });

  var out = order.map(function (s) { return add[s]; });
  if (out.length) {
    sh.getRange(sh.getLastRow() + 1, 1, out.length, found.width).setValues(out);
    SpreadsheetApp.flush();
  }
  // 取り込み終わったログは削除せず「_v1アーカイブ」へ
  var archived = 0;
  if (readFiles) {
    var arc = v2Folder_(V2.archiveV1Name);
    logs.forEach(function (f) { try { moveFile_(f, arc); archived++; } catch (e) { Logger.log('移動できません: ' + f.getName()); } });
  }
  var msg = cfg.label + ': ログ' + readFiles + '本 → ' + cfg.baseName + '［' + found.name + '］' +
            ' に' + out.length + '行追加（元からあった' + before + '行はそのまま／重複' + skipped + '行は見送り）' +
            (addedCols.length ? '／足した列: ' + addedCols.join('・') : '') +
            '／_v1アーカイブへ' + archived + '本';
  Logger.log(msg);
  return { label: cfg.label, ok: true, added: out.length, archived: archived, msg: msg };
}

/**
 * 日次ログ → 台帳_base の対応表。
 * tools/test/test-intake.js がこの**本物の設定**をそのまま使って移行を検証する
 * （テスト用に書き写すと、直したつもりが片方だけになる）。
 */
function v2MigratePlan_() {
  return [
    { label: 'udemy', folderId: CONFIG.udemyFolderId, baseName: CONFIG.udemyBaseName,
      sheetTab: '台帳ログ',                       // 1枚目はダッシュボード。実体はこのシート
      logRe: /^Udemy台帳ログ_\d{4}-\d{2}-\d{2}/,
      head: UDEMY_MERGE_HEAD, key: ['記録日', 'コースID'],
      alias: { '記録日': ['日付'], '基準時刻': ['時刻'], 'コースID': ['ID'], 'コース名': ['講座名'],
               '公開年月': ['公開月'], '累計登録': ['累計登録者', '累計受講生'],
               '累計収益USD': ['累計収益', '収益'], '施策メモ': ['施策', 'メモ'] } },
    { label: 'note', folderId: CONFIG.gokigenFolderId, baseName: 'note台帳_base',
      logRe: new RegExp('^' + CONFIG.noteDeltaPrefix + '\\d{4}-\\d{2}-\\d{2}'),
      head: ['記録日', '集計時刻', '期間種別', '期間', '全体ビュー', 'コメント', 'スキ', '備考'],
      key: ['記録日', '期間種別'], alias: { '全体ビュー': ['ビュー'] } },
    { label: 'economy', folderId: CONFIG.ecoFolderId, baseName: CONFIG.ecoBaseName,
      logRe: /^経済台帳ログ_\d{4}-\d{2}-\d{2}/,
      head: ['記録日', '口座/資産名', '区分', '評価額', '通貨', '出所'],
      key: ['記録日', '口座/資産名', '区分'],
      /* 実物の見出しは「日付／区分／項目／数量・額面／評価額円／評価損益円／損益率／備考」。
         「通貨」の列は元々無いので、右端に足される（既存の行は空欄のまま＝円建て）。 */
      alias: { '記録日': ['日付'], '口座/資産名': ['項目', '口座', '資産名'],
               '評価額': ['評価額円', '金額'], '出所': ['備考'] } },
    { label: 'limitless', folderId: CONFIG.limitlessFolderId, baseName: CONFIG.limitlessBaseName,
      logRe: /^リミットレス台帳ログ_\d{4}-\d{2}-\d{2}/,
      head: ['日付', '種別', '内容', '関連', '出所'], key: ['日付', '内容'],
      alias: { '日付': ['記録日'], '種別': ['分類'] } }
  ];
}

/** STEP2 本体。何度実行しても壊れない（足りないぶんだけ足す） */
function step2_migrateV1ToBase() {
  var out = [];
  // ① GOKIGEN台帳の日次ファイル → GOKIGEN台帳_base（既存の統合処理をそのまま使う。元ファイルは「圧縮済み」へ）
  try {
    var g = consolidateGokigen_(v2Today_(), null, 1);
    out.push('gokigen: ' + (typeof g === 'string' ? g : JSON.stringify(g)));
  } catch (e) { out.push('gokigen: 失敗 ' + e); }

  // ② そのほかの台帳（列の名前で突き合わせる）
  v2MigratePlan_().forEach(function (cfg) {
    try { out.push(v2Migrate_(cfg).msg); }
    catch (e) { out.push(cfg.label + ': 失敗 ' + e); }
  });

  var msg = 'STEP2 移行\n' + out.join('\n');
  Logger.log(msg);
  return msg;
}

/**
 * 台帳のシートと見出しを一覧する（読むだけ・何も書き換えない）。
 * 「列がありません」と言われたとき、実際に何という見出しが並んでいるのかを見るための関数。
 */
function step2_checkLedgers() {
  var targets = [
    { n: CONFIG.gokigenBaseName,   f: CONFIG.gokigenFolderId },
    { n: CONFIG.udemyBaseName,     f: CONFIG.udemyFolderId },
    { n: 'note台帳_base',           f: CONFIG.gokigenFolderId },
    { n: CONFIG.ecoBaseName,       f: CONFIG.ecoFolderId },
    { n: CONFIG.limitlessBaseName, f: CONFIG.limitlessFolderId },
    { n: CONFIG.placesFileName,    f: CONFIG.gokigenFolderId },
    { n: CONFIG.mtnFileName,       f: CONFIG.gokigenFolderId }
  ];
  var out = [];
  targets.forEach(function (t) {
    var file = null;
    try { file = fileInFolder_(DriveApp.getFolderById(t.f), t.n); } catch (e) {}
    if (!file) { out.push('― ' + t.n + '：まだありません'); return; }
    out.push('■ ' + t.n);
    try {
      SpreadsheetApp.openById(file.getId()).getSheets().forEach(function (sh) {
        var head = v2SheetHead_(sh);
        var line = '(空)';
        if (head.length) {
          line = head[0].map(function (x) { return String(x == null ? '' : x).trim(); })
                        .filter(String).slice(0, 12).join(' ｜ ');
        }
        out.push('　［' + sh.getName() + '］' + sh.getLastRow() + '行　' + line);
      });
    } catch (e) { out.push('　読めません: ' + e); }
  });
  var msg = '台帳のシートと見出し（1行目）\n' + out.join('\n');
  Logger.log(msg);
  return msg;
}
