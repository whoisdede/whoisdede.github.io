/**
 * Ranking Natalino de Chocotones — Backend Google Apps Script
 *
 * Como instalar na sua planilha do Google Sheets:
 * 1. Abra a planilha no Google Sheets.
 * 2. Vá em Extensões > Apps Script.
 * 3. Apague o código padrão e cole todo este arquivo. Salve (Ctrl+S).
 * 4. Clique em Implantar > Nova implantação > Tipo: App da Web.
 *    - Executar como: Eu (sua conta)
 *    - Quem pode acessar: Qualquer pessoa
 * 5. Autorize o acesso e copie a URL gerada (/exec).
 * 6. Cole essa URL em `ranking-natalino/config.js` ou no botão "Conectar Google Sheets" do app.
 */

const SHEET_WEEKS = 'Semanas';
const SHEET_VOTES = 'Avaliacoes';
const SHEET_SUMMARY = 'Resumo_Ranking';

const CATEGORIES = ['sabor', 'recheio', 'maciez', 'docura'];

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = String(params.action || 'getAll');

    if (action === 'ping') {
      return jsonResponse_({
        ok: true,
        service: 'ranking-natalino',
        timestamp: new Date().toISOString()
      });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSetup_(ss);

    return jsonResponse_(buildPayload_(ss));
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: err && err.message ? err.message : String(err)
    });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const rawBody = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(rawBody);
    const action = String(body.action || '');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSetup_(ss);

    let mode = 'ok';

    if (action === 'submitVote') {
      mode = upsertVote_(ss, body);
    } else if (action === 'saveWeek') {
      mode = upsertWeek_(ss, body);
    } else if (action === 'deleteVote') {
      mode = removeVote_(ss, body);
    } else if (action === 'syncImport') {
      mode = importPayload_(ss, body);
    } else {
      throw new Error('Ação desconhecida: ' + action);
    }

    try {
      rebuildSummarySheet_(ss);
    } catch (summaryErr) {
      // Não impede o salvamento caso a aba visual esteja bloqueada
    }

    const payload = buildPayload_(ss);
    payload.mode = mode;
    return jsonResponse_(payload);
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: err && err.message ? err.message : String(err)
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeCellText_(value, maxLen) {
  let str = String(value == null ? '' : value).trim().slice(0, maxLen || 200);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return str;
}

function parseScore_(value, fieldName) {
  const num = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(num) || num < 0 || num > 10) {
    throw new Error('Nota inválida para ' + fieldName + ' (use valores de 0 a 10).');
  }
  return Math.round(num * 100) / 100;
}

function parseWeekNum_(value) {
  const num = parseInt(value, 10);
  if (!Number.isFinite(num) || num < 1 || num > 52) {
    throw new Error('Número da semana inválido.');
  }
  return num;
}

function ensureSetup_(ss) {
  let weeksSheet = ss.getSheetByName(SHEET_WEEKS);
  let votesSheet = ss.getSheetByName(SHEET_VOTES);
  let createdFresh = false;

  if (!weeksSheet) {
    weeksSheet = ss.insertSheet(SHEET_WEEKS);
    weeksSheet.appendRow(['semana', 'chocotone', 'marca', 'observacao', 'atualizado_em']);
    weeksSheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    weeksSheet.setFrozenRows(1);
    createdFresh = true;
  }

  if (!votesSheet) {
    votesSheet = ss.insertSheet(SHEET_VOTES);
    votesSheet.appendRow([
      'semana',
      'pessoa',
      'sabor',
      'recheio',
      'maciez',
      'docura',
      'media',
      'comentario',
      'atualizado_em'
    ]);
    votesSheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    votesSheet.setFrozenRows(1);
    createdFresh = true;
  }

  if (createdFresh && weeksSheet.getLastRow() <= 1 && votesSheet.getLastRow() <= 1) {
    const imported = tryImportLegacySheet_(ss);
    if (imported.weeks.length > 0) {
      writeAllWeeks_(weeksSheet, imported.weeks);
      writeAllVotes_(votesSheet, imported.votes);
    } else {
      const seed = getDefaultSeed_();
      writeAllWeeks_(weeksSheet, seed.weeks);
      writeAllVotes_(votesSheet, seed.votes);
    }
    try {
      rebuildSummarySheet_(ss);
    } catch (_) {}
  }
}

function readWeeks_(ss) {
  const sheet = ss.getSheetByName(SHEET_WEEKS);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  const weeks = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const weekNum = parseInt(r[0], 10);
    if (!Number.isFinite(weekNum) || weekNum < 1) continue;
    weeks.push({
      week: weekNum,
      chocotone: String(r[1] || '').trim(),
      brand: String(r[2] || '').trim(),
      notes: String(r[3] || '').trim(),
      updatedAt: r[4] ? String(r[4]) : ''
    });
  }
  weeks.sort((a, b) => a.week - b.week);
  return weeks;
}

function readVotes_(ss) {
  const sheet = ss.getSheetByName(SHEET_VOTES);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  const votes = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const weekNum = parseInt(r[0], 10);
    const person = String(r[1] || '').trim();
    if (!Number.isFinite(weekNum) || !person) continue;
    const sabor = Number(r[2]);
    const recheio = Number(r[3]);
    const maciez = Number(r[4]);
    const docura = Number(r[5]);
    if (![sabor, recheio, maciez, docura].every(Number.isFinite)) continue;
    votes.push({
      week: weekNum,
      person: person,
      sabor: sabor,
      recheio: recheio,
      maciez: maciez,
      docura: docura,
      comment: String(r[7] || '').trim(),
      updatedAt: r[8] ? String(r[8]) : ''
    });
  }
  return votes;
}

function buildPayload_(ss) {
  return {
    ok: true,
    weeks: readWeeks_(ss),
    votes: readVotes_(ss),
    updatedAt: new Date().toISOString()
  };
}

function upsertWeek_(ss, body) {
  const weekNum = parseWeekNum_(body.week);
  const chocotone = safeCellText_(body.chocotone, 120);
  if (!chocotone) {
    throw new Error('Informe o nome do chocotone da semana.');
  }
  const brand = safeCellText_(body.brand || '', 80);
  const notes = safeCellText_(body.notes || '', 200);
  const now = new Date().toISOString();

  const sheet = ss.getSheetByName(SHEET_WEEKS);
  const existing = readWeeks_(ss);
  const idx = existing.findIndex((w) => w.week === weekNum);

  if (idx >= 0) {
    const rowNumber = idx + 2;
    // Re-encontrar linha exata na planilha caso não esteja ordenada
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    let targetRow = rowNumber;
    for (let i = 0; i < rows.length; i++) {
      if (parseInt(rows[i][0], 10) === weekNum) {
        targetRow = i + 2;
        break;
      }
    }
    sheet.getRange(targetRow, 1, 1, 5).setValues([[weekNum, chocotone, brand, notes, now]]);
    return 'updated';
  }

  sheet.appendRow([weekNum, chocotone, brand, notes, now]);
  return 'created';
}

function upsertVote_(ss, body) {
  const weekNum = parseWeekNum_(body.week);
  const person = safeCellText_(body.person, 60);
  if (!person) {
    throw new Error('Informe seu nome.');
  }

  const weeks = readWeeks_(ss);
  const weekObj = weeks.find((w) => w.week === weekNum);
  if (!weekObj || !weekObj.chocotone) {
    throw new Error('A Semana ' + weekNum + ' ainda não tem um chocotone definido.');
  }

  const sabor = parseScore_(body.sabor, 'Sabor');
  const recheio = parseScore_(body.recheio, 'Recheio');
  const maciez = parseScore_(body.maciez, 'Maciez');
  const docura = parseScore_(body.docura, 'Doçura');
  const media = Math.round(((sabor + recheio + maciez + docura) / 4) * 1000) / 1000;
  const comment = safeCellText_(body.comment || '', 240);
  const now = new Date().toISOString();

  const sheet = ss.getSheetByName(SHEET_VOTES);
  const lastRow = sheet.getLastRow();
  let matchRow = -1;

  if (lastRow > 1) {
    const keys = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    const targetPerson = person.toLowerCase();
    for (let i = 0; i < keys.length; i++) {
      if (parseInt(keys[i][0], 10) === weekNum && String(keys[i][1] || '').trim().toLowerCase() === targetPerson) {
        matchRow = i + 2;
        break;
      }
    }
  }

  const rowValues = [weekNum, person, sabor, recheio, maciez, docura, media, comment, now];
  if (matchRow > 0) {
    sheet.getRange(matchRow, 1, 1, 9).setValues([rowValues]);
    return 'updated';
  }

  sheet.appendRow(rowValues);
  return 'created';
}

function removeVote_(ss, body) {
  const weekNum = parseWeekNum_(body.week);
  const person = String(body.person || '').trim().toLowerCase();
  if (!person) throw new Error('Nome inválido para remoção.');

  const sheet = ss.getSheetByName(SHEET_VOTES);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 'not_found';

  const keys = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = keys.length - 1; i >= 0; i--) {
    if (parseInt(keys[i][0], 10) === weekNum && String(keys[i][1] || '').trim().toLowerCase() === person) {
      sheet.deleteRow(i + 2);
      return 'deleted';
    }
  }
  return 'not_found';
}

function importPayload_(ss, body) {
  const incomingWeeks = Array.isArray(body.weeks) ? body.weeks : [];
  const incomingVotes = Array.isArray(body.votes) ? body.votes : [];

  for (let i = 0; i < incomingWeeks.length; i++) {
    const w = incomingWeeks[i];
    if (w && w.week && w.chocotone) {
      upsertWeek_(ss, w);
    }
  }
  for (let j = 0; j < incomingVotes.length; j++) {
    const v = incomingVotes[j];
    if (v && v.week && v.person) {
      upsertVote_(ss, v);
    }
  }
  return 'imported';
}

function writeAllWeeks_(sheet, weeks) {
  if (!weeks.length) return;
  const now = new Date().toISOString();
  const rows = weeks.map((w) => [
    w.week,
    safeCellText_(w.chocotone, 120),
    safeCellText_(w.brand || '', 80),
    safeCellText_(w.notes || '', 200),
    now
  ]);
  sheet.getRange(2, 1, rows.length, 5).setValues(rows);
}

function writeAllVotes_(sheet, votes) {
  if (!votes.length) return;
  const now = new Date().toISOString();
  const rows = votes.map((v) => {
    const avg = Math.round(((v.sabor + v.recheio + v.maciez + v.docura) / 4) * 1000) / 1000;
    return [
      v.week,
      safeCellText_(v.person, 60),
      v.sabor,
      v.recheio,
      v.maciez,
      v.docura,
      avg,
      safeCellText_(v.comment || '', 240),
      now
    ];
  });
  sheet.getRange(2, 1, rows.length, 9).setValues(rows);
}

/**
 * Tenta ler os dados do formato original da planilha (blocos "Semana 1", "Semana 2", ...).
 */
function tryImportLegacySheet_(ss) {
  const reserved = [SHEET_WEEKS, SHEET_VOTES, SHEET_SUMMARY];
  const sheets = ss.getSheets();
  const weeks = [];
  const votes = [];

  for (let s = 0; s < sheets.length; s++) {
    const sheet = sheets[s];
    if (reserved.indexOf(sheet.getName()) !== -1) continue;
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 6 || lastCol < 2) continue;

    const grid = sheet.getRange(1, 1, Math.min(lastRow, 200), Math.min(lastCol, 40)).getValues();
    for (let r = 0; r < grid.length; r++) {
      const cellA = String(grid[r][0] || '').trim();
      const match = /^semana\s*(\d+)/i.exec(cellA);
      if (!match) continue;

      const weekNum = parseInt(match[1], 10);
      if (r + 5 >= grid.length) continue;

      const headerRow = grid[r + 1];
      const chocotone = String(headerRow[0] || '').trim();
      if (!chocotone) continue;

      const peopleCols = [];
      for (let c = 1; c < headerRow.length; c++) {
        const name = String(headerRow[c] || '').trim();
        if (!name) continue;
        const normalized = name.toLowerCase();
        if (normalized === 'média' || normalized === 'media') break;
        peopleCols.push({ col: c, name: name });
      }

      const catRows = {};
      for (let offset = 2; offset <= 5; offset++) {
        const label = String(grid[r + offset][0] || '').trim().toUpperCase();
        if (label.indexOf('SABOR') !== -1) catRows.sabor = grid[r + offset];
        else if (label.indexOf('RECHEIO') !== -1) catRows.recheio = grid[r + offset];
        else if (label.indexOf('MACIEZ') !== -1) catRows.maciez = grid[r + offset];
        else if (label.indexOf('DOÇURA') !== -1 || label.indexOf('DOCURA') !== -1) catRows.docura = grid[r + offset];
      }

      if (!catRows.sabor || !catRows.recheio || !catRows.maciez || !catRows.docura) continue;

      weeks.push({ week: weekNum, chocotone: chocotone, brand: '', notes: '' });

      for (let p = 0; p < peopleCols.length; p++) {
        const col = peopleCols[p].col;
        const rawVals = [
          catRows.sabor[col],
          catRows.recheio[col],
          catRows.maciez[col],
          catRows.docura[col]
        ];
        if (rawVals.some((v) => v === '' || v == null)) continue;
        const nums = rawVals.map((v) => Number(String(v).replace(',', '.')));
        if (!nums.every(Number.isFinite)) continue;
        votes.push({
          week: weekNum,
          person: peopleCols[p].name,
          sabor: nums[0],
          recheio: nums[1],
          maciez: nums[2],
          docura: nums[3],
          comment: ''
        });
      }
    }

    if (weeks.length > 0) break;
  }

  return { weeks: weeks, votes: votes };
}

/**
 * Reconstrói a aba Resumo_Ranking no estilo visual da planilha original + pódio geral.
 */
function rebuildSummarySheet_(ss) {
  let sheet = ss.getSheetByName(SHEET_SUMMARY);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_SUMMARY);
  }
  sheet.clear();

  const weeks = readWeeks_(ss);
  const votes = readVotes_(ss);

  const summaryRows = [];
  weeks.forEach((w) => {
    const wVotes = votes.filter((v) => v.week === w.week);
    if (!wVotes.length) return;
    const avg = (key) => wVotes.reduce((sum, v) => sum + v[key], 0) / wVotes.length;
    const s = avg('sabor');
    const r = avg('recheio');
    const m = avg('maciez');
    const d = avg('docura');
    const total = (s + r + m + d) / 4;
    summaryRows.push({
      week: w.week,
      chocotone: w.chocotone,
      count: wVotes.length,
      sabor: s,
      recheio: r,
      maciez: m,
      docura: d,
      total: total
    });
  });
  summaryRows.sort((a, b) => b.total - a.total);

  let rowCursor = 1;
  sheet.getRange(rowCursor, 1).setValue('RANKING GERAL DE CHOCOTONES').setFontWeight('bold').setFontSize(12);
  rowCursor += 1;

  sheet.getRange(rowCursor, 1, 1, 9)
    .setValues([['Posição', 'Semana', 'Chocotone', 'Votos', 'Sabor', 'Recheio', 'Maciez', 'Doçura', 'Média Geral']])
    .setFontWeight('bold')
    .setBackground('#14452f')
    .setFontColor('#ffffff');
  rowCursor += 1;

  summaryRows.forEach((item, idx) => {
    sheet.getRange(rowCursor, 1, 1, 9).setValues([[
      (idx + 1) + 'º',
      'Semana ' + item.week,
      item.chocotone,
      item.count,
      round2_(item.sabor),
      round2_(item.recheio),
      round2_(item.maciez),
      round2_(item.docura),
      round2_(item.total)
    ]]);
    sheet.getRange(rowCursor, 5, 1, 5).setNumberFormat('0.00');
    rowCursor += 1;
  });

  rowCursor += 1;

  weeks.forEach((w) => {
    const wVotes = votes.filter((v) => v.week === w.week);
    sheet.getRange(rowCursor, 1).setValue('Semana ' + w.week).setFontWeight('bold').setBackground('#f3eadc');
    rowCursor += 1;

    const people = wVotes.map((v) => v.person);
    const header = [w.chocotone].concat(people).concat(['Média']);
    sheet.getRange(rowCursor, 1, 1, header.length)
      .setValues([header])
      .setFontWeight('bold')
      .setBackground('#e7dccb');

    const catMap = [
      ['SABOR', 'sabor'],
      ['RECHEIO', 'recheio'],
      ['MACIEZ', 'maciez'],
      ['DOÇURA', 'docura']
    ];

    catMap.forEach((pair, offset) => {
      const label = pair[0];
      const key = pair[1];
      const vals = wVotes.map((v) => v[key]);
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : '';
      const rowData = [label].concat(vals).concat([avg === '' ? '' : round2_(avg)]);
      sheet.getRange(rowCursor + 1 + offset, 1, 1, rowData.length).setValues([rowData]);
    });

    const avgRow = ['Média'].concat(
      wVotes.map((v) => round2_((v.sabor + v.recheio + v.maciez + v.docura) / 4))
    );
    const overall = wVotes.length
      ? round2_(wVotes.reduce((acc, v) => acc + (v.sabor + v.recheio + v.maciez + v.docura) / 4, 0) / wVotes.length)
      : '';
    avgRow.push(overall);

    sheet.getRange(rowCursor + 5, 1, 1, avgRow.length)
      .setValues([avgRow])
      .setFontWeight('bold')
      .setBackground('#f8f3eb');

    rowCursor += 7;
  });
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}

function getDefaultSeed_() {
  return {
    weeks: [
      { week: 1, chocotone: 'Santa edwides avelã', brand: 'Santa Edwiges', notes: 'Importado da planilha original' },
      { week: 2, chocotone: 'Bauducco gotas', brand: 'Bauducco', notes: 'Importado da planilha original' }
    ],
    votes: [
      { week: 1, person: 'Ana', sabor: 7, recheio: 8, maciez: 4, docura: 6, comment: '' },
      { week: 1, person: 'André', sabor: 7, recheio: 8, maciez: 3, docura: 5, comment: '' },
      { week: 1, person: 'Carol', sabor: 6, recheio: 6, maciez: 4, docura: 6, comment: '' },
      { week: 1, person: 'João', sabor: 9, recheio: 9, maciez: 7, docura: 5, comment: '' },
      { week: 1, person: 'Jonas', sabor: 7, recheio: 8, maciez: 6, docura: 8, comment: '' },
      { week: 1, person: 'Mandy', sabor: 7, recheio: 7, maciez: 5, docura: 8, comment: '' },
      { week: 1, person: 'Mariana', sabor: 8, recheio: 7, maciez: 5, docura: 9, comment: '' },
      { week: 1, person: 'Regina', sabor: 7, recheio: 8, maciez: 7, docura: 6, comment: '' },
      { week: 1, person: 'Ortiga', sabor: 8, recheio: 5, maciez: 8, docura: 7, comment: '' },
      { week: 2, person: 'Ana', sabor: 8, recheio: 6, maciez: 8, docura: 7.5, comment: '' },
      { week: 2, person: 'André', sabor: 6, recheio: 4, maciez: 9, docura: 8, comment: '' },
      { week: 2, person: 'Carolina', sabor: 8, recheio: 9, maciez: 10, docura: 8, comment: '' },
      { week: 2, person: 'João', sabor: 7, recheio: 6, maciez: 9, docura: 8, comment: '' },
      { week: 2, person: 'Jonas', sabor: 8, recheio: 6, maciez: 7, docura: 8, comment: '' },
      { week: 2, person: 'Mandy', sabor: 8, recheio: 5, maciez: 8, docura: 8, comment: '' },
      { week: 2, person: 'Mariana', sabor: 9, recheio: 5, maciez: 8.5, docura: 8, comment: '' },
      { week: 2, person: 'Barbara', sabor: 8.5, recheio: 9, maciez: 8.5, docura: 8.5, comment: '' },
      { week: 2, person: 'Ortiga', sabor: 7, recheio: 7, maciez: 9, docura: 8, comment: '' },
      { week: 2, person: 'Samuel', sabor: 7, recheio: 6, maciez: 9, docura: 6, comment: '' }
    ]
  };
}
