// ===== CONFIG =====
// Set this to your deployed Google Apps Script Web App URL (use the /exec URL)
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbz0AW0RVVcYTltrl-xxgF_zPpRys8exi4H0MsTI09nAi4GJGjdG6JtysVJaHi0jDrOzow/exec';

// CSV location in your repo (served by GitHub Pages)
const CSV_URL = 'data/patients.csv';

// ===== Local storage keys =====
const LS_KEY_INDEX = 'cer_current_index';
const LS_KEY_SUBMITTED = 'cer_submitted_ids';

// ===== State =====
let patients = [];
let idx = 0;
let submittedIds = {}; // { patientKey: true }

// ===== Helpers =====
function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

function loadLocalState(){
  const savedIdx = localStorage.getItem(LS_KEY_INDEX);
  idx = savedIdx ? parseInt(savedIdx, 10) : 0;
  const raw = localStorage.getItem(LS_KEY_SUBMITTED);
  submittedIds = raw ? JSON.parse(raw) : {};
}
function saveLocalState(){
  localStorage.setItem(LS_KEY_INDEX, String(idx));
  localStorage.setItem(LS_KEY_SUBMITTED, JSON.stringify(submittedIds));
}

// Basic CSV parser that handles quoted commas
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line, i) => {
    const cells = parseCsvLine(line);
    const obj = {};
    header.forEach((h, j) => { obj[h.trim()] = (cells[j] ?? '').replace(/^"|"$/g, ''); });
    obj.__row_index = i; // zero-based (excludes header)
    return obj;
  });
  return { header, rows };
}

function parseCsvLine(line){
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++){
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ){ out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function loadCSV(){
  const res = await fetch(CSV_URL, { cache: 'no-store' });
  const text = await res.text();
  return parseCSV(text);
}

function patientKey(p){
  return p.patient_id || p.Patient_ID || p.id || p.ID || null;
}

// Use the LAST THREE columns of the CSV as the expert-fill targets
function expertColumnIndexes(header){
  const n = header.length;
  return [n - 3, n - 2, n - 1];
}

function renderPatient(){
  if (!patients.length) return;

  if (idx < 0) idx = 0;
  if (idx >= patients.length) idx = patients.length - 1;

  const p = patients[idx];
  const header = patients.meta.header;
  const [iA, iB, iC] = expertColumnIndexes(header);
  const hidden = new Set([header[iA], header[iB], header[iC]]);

  $('#position').textContent = `Patient ${idx + 1} of ${patients.length}`;
  $('#patientTitle').textContent = patientKey(p) ? `Patient ${patientKey(p)}` : `Patient ${idx + 1}`;

  // Build table that hides the last-3 expert columns
  const table = document.createElement('table');
  table.id = 'patientTable';
  header.forEach((col) => {
    if (hidden.has(col)) return;
    const tr = document.createElement('tr');
    const th = document.createElement('th'); th.textContent = col;
    const td = document.createElement('td'); td.textContent = p[col];
    tr.append(th, td);
    table.appendChild(tr);
  });
  const wrap = $('#patientTableWrap');
  wrap.innerHTML = '';
  wrap.appendChild(table);

  // Reset inputs
  $('#outcome').value = '';
  $all('input[name="confidence"]').forEach(r => r.checked = false);
  $('#snotSlider').value = 55;
  $('#snotValue').textContent = '55';

  // Duplicate guard per-browser
  const key = patientKey(p) ?? String(idx);
  const was = !!submittedIds[key];
  $('#allowResubmit').checked = false;
  $('#saveSubmitBtn').disabled = was;
  $('#status').textContent = was ? 'Already submitted from this browser. Check “Allow re-submit” to send again.' : '';
  $('#status').className = 'status';
}

function flash(msg, isErr){
  const el = $('#status');
  el.textContent = msg;
  el.className = 'status ' + (isErr ? 'err' : 'ok');
}

async function submitAndNext(){
  if (!ENDPOINT || ENDPOINT.startsWith('REPLACE_')){
    flash('Endpoint not configured. Contact the admin.', true);
    return;
  }

  const p = patients[idx];
  const header = patients.meta.header;
  const [iA, iB, iC] = expertColumnIndexes(header);

  const outcome = $('#outcome').value;
  const confRadio = $all('input[name="confidence"]').find(r => r.checked);
  const confidence = confRadio ? confRadio.value : '';
  const snot = $('#snotSlider').value;

  if (!outcome || !confidence){
    flash('Please select outcome and confidence.', true);
    return;
  }

  const key = patientKey(p) ?? String(idx);
  if (submittedIds[key] && !$('#allowResubmit').checked){
    flash('Already submitted from this browser for this patient. Enable “Allow re-submit” to send again.', true);
    return;
  }

  const payload = {
    _meta: { ts: Date.now() },
    csv_last3_indexes: [iA, iB, iC],     // which columns to fill (last three)
    patient_index: p.__row_index,        // 0-based row index in CSV (excluding header)
    patient_key: patientKey(p),
    answers: {
      col1: outcome,
      col2: confidence,
      col3: Number(snot)
    },
    header: header                       // for safety/debugging on backend
  };

  try{
    $('#saveSubmitBtn').disabled = true;

    // IMPORTANT: use no-cors so the browser won’t block cross-origin response
    // The request will still reach Apps Script and update the sheet, but the
    // response will be opaque (we don't read it).
    await fetch(ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify(payload)
    });

    // If fetch resolved without throwing, assume success
    submittedIds[key] = true;
    saveLocalState();
    flash('Saved!', false);

    // Move to next patient
    idx = Math.min(idx + 1, patients.length - 1);
    saveLocalState();
    renderPatient();

  } catch (err){
    console.error(err);
    flash('Error: ' + err.message, true);
  } finally {
    $('#saveSubmitBtn').disabled = false;
  }
}

async function main(){
  loadLocalState();
  $('#prevBtn').addEventListener('click', () => { idx = Math.max(0, idx - 1); saveLocalState(); renderPatient(); });
  $('#nextBtn').addEventListener('click', () => { idx = Math.min(patients.length - 1, idx + 1); saveLocalState(); renderPatient(); });
  $('#saveSubmitBtn').addEventListener('click', submitAndNext);
  $('#snotSlider').addEventListener('input', e => $('#snotValue').textContent = e.target.value);

  const parsed = await loadCSV();
  patients = parsed.rows;
  patients.meta = { header: parsed.header };
  renderPatient();
}

main();