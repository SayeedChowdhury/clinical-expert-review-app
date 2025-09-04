/***** CONFIG *****/
const SHEET_NAME = 'BaseCSV';
const PROP_KEY_SPREADSHEET_ID = 'SPREADSHEET_ID';

// 👇 Replace with your RAW GitHub CSV URL (patients.csv in your repo)
const SOURCE_CSV_URL = 'https://raw.githubusercontent.com/SayeedChowdhury/clinical-expert-review-app/main/data/patients.csv';
/******************/

/** Always open/create our own spreadsheet (works for standalone Web Apps). */
function _getSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(PROP_KEY_SPREADSHEET_ID);
  let ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('ClinicalExpertReview_BaseCSV');
    props.setProperty(PROP_KEY_SPREADSHEET_ID, ss.getId());
  }
  return ss;
}

function _getBaseSheet() {
  const ss = _getSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  return sh;
}

/** Minimal CSV line parser supporting quoted commas. */
function _parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.replace(/^"|"$/g, ''));
}

/** One-time (or re-run to refresh): load RAW CSV → sheet, add _row_index helper. */
function initializeFromCsv() {
  if (!SOURCE_CSV_URL || SOURCE_CSV_URL.includes('<you>')) {
    throw new Error('❌ Set SOURCE_CSV_URL to your RAW GitHub CSV before running initializeFromCsv()');
  }

  const resp = UrlFetchApp.fetch(SOURCE_CSV_URL, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error('❌ Failed to fetch CSV: ' + resp.getContentText());
  }

  const text = resp.getContentText();
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  const header = _parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line, i) => {
    const parsed = _parseCsvLine(line);
    parsed.push(String(i)); // add _row_index helper
    return parsed;
  });

  const sh = _getBaseSheet();
  sh.clear();

  const headerPlus = header.slice();
  headerPlus.push('_row_index');

  if (headerPlus.length > sh.getMaxColumns())
    sh.insertColumns(sh.getLastColumn() + 1, headerPlus.length - sh.getMaxColumns());
  sh.getRange(1, 1, 1, headerPlus.length).setValues([headerPlus]);

  if (rows.length) {
    if (rows[0].length > sh.getMaxColumns())
      sh.insertColumns(sh.getLastColumn() + 1, rows[0].length - sh.getMaxColumns());
    sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

/** GET:
 *  - /exec?format=csv → current CSV (last-3 filled), _row_index dropped
 *  - /exec → health JSON (+ spreadsheet URL)
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.format === 'csv') {
    const sh = _getBaseSheet();
    const data = sh.getDataRange().getValues();
    const header = data[0];
    const cols = header.length - 1; // drop _row_index

    const out = data.map(row => row.slice(0, cols).map(v => {
      const s = (v == null ? '' : String(v));
      return s.includes(',') ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');

    return ContentService.createTextOutput(out)
      .setMimeType(ContentService.MimeType.CSV);
  }

  const ss = _getSpreadsheet();
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    spreadsheetUrl: ss.getUrl(),
    sheet: SHEET_NAME
  })).setMimeType(ContentService.MimeType.JSON);
}

/** POST: fill LAST THREE columns for the matched row (by patient_id or _row_index). */
function doPost(e) {
  try {
    const body = e.postData && e.postData.contents ? e.postData.contents : '{}';
    const data = JSON.parse(body);

    const sh = _getBaseSheet();
    const values = sh.getDataRange().getValues();
    const header = values[0];
    const rows = values.slice(1);
    const nCols = header.length;

    const last3 = data.csv_last3_indexes;
    if (!Array.isArray(last3) || last3.length !== 3) {
      throw new Error('csv_last3_indexes must be [iA,iB,iC]');
    }
    const iA = last3[0] + 1; // 1-based
    const iB = last3[1] + 1;
    const iC = last3[2] + 1;

    const idxPatientId = header.indexOf('patient_id');
    const idxRowIdx = header.length - 1; // _row_index
    const key = data.patient_key;
    const rowIdx = data.patient_index; // 0-based from CSV

    let rowNumber = -1; // 1-based row (excluding header)
    if (key != null && idxPatientId >= 0) {
      for (let r = 0; r < rows.length; r++) {
        if (String(rows[r][idxPatientId]) === String(key)) { rowNumber = r + 1; break; }
      }
    }
    if (rowNumber < 0 && rowIdx != null) {
      for (let r = 0; r < rows.length; r++) {
        if (String(rows[r][idxRowIdx]) === String(rowIdx)) { rowNumber = r + 1; break; }
      }
    }
    if (rowNumber < 0) throw new Error('Row not found for patient_key=' + key + ' or index=' + rowIdx);

    const col1 = data.answers?.col1 ?? '';
    const col2 = data.answers?.col2 ?? '';
    const col3 = data.answers?.col3 ?? '';

    const range = sh.getRange(rowNumber + 1, 1, 1, nCols); // +1 to skip header
    const rowVals = range.getValues()[0];
    rowVals[iA - 1] = col1;
    rowVals[iB - 1] = col2;
    rowVals[iC - 1] = col3;
    range.setValues([rowVals]);

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}