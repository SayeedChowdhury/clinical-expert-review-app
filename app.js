
const CSV_URL = 'data/patients.csv';
const LS_KEY_INDEX = 'cer_current_index';
const LS_KEY_ENDPOINT = 'cer_endpoint';
const LS_KEY_SUBMITTED = 'cer_submitted_ids';

let patients = [];
let idx = 0;
let endpoint = '';
let submittedIds = {}; // {patientKey:true}

function $(sel){ return document.querySelector(sel); }
function $all(sel){ return [...document.querySelectorAll(sel)]; }

function loadLocalState(){
  const savedIdx = localStorage.getItem(LS_KEY_INDEX);
  idx = savedIdx ? parseInt(savedIdx,10) : 0;
  endpoint = localStorage.getItem(LS_KEY_ENDPOINT) || '';
  const raw = localStorage.getItem(LS_KEY_SUBMITTED);
  submittedIds = raw ? JSON.parse(raw) : {};
  $('#endpointInput').value = endpoint;
}

function saveLocalState(){
  localStorage.setItem(LS_KEY_INDEX, String(idx));
  localStorage.setItem(LS_KEY_ENDPOINT, endpoint || '');
  localStorage.setItem(LS_KEY_SUBMITTED, JSON.stringify(submittedIds));
}

async function loadCSV(){
  const res = await fetch(CSV_URL,{cache:'no-store'});
  const text = await res.text();
  return parseCSV(text);
}

// Simple CSV parser
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  const header = lines[0].split(',');
  const rows = lines.slice(1).map(line => {
    // crude split that handles quotes minimally
    const cells = [];
    let cur = '';
    let inQ = false;
    for (let i=0;i<line.length;i++){
      const c = line[i];
      if(c === '"' ){
        inQ = !inQ;
      }else if(c === ',' && !inQ){
        cells.push(cur);
        cur = '';
      }else{
        cur += c;
      }
    }
    cells.push(cur);
    const obj = {};
    header.forEach((h,j)=> obj[h.trim()] = (cells[j] ?? '').replace(/^"|"$/g,''));
    return obj;
  });
  return {header, rows};
}

function patientKey(p){
  // prefer patient_id or id; else use row index
  return p.patient_id || p.Patient_ID || p.id || p.ID || null;
}

function renderPatient(){
  if(!patients.length) return;
  if(idx < 0) idx = 0;
  if(idx >= patients.length) idx = patients.length-1;
  const p = patients[idx];

  $('#position').textContent = `Patient ${idx+1} of ${patients.length}`;
  const titleId = patientKey(p);
  $('#patientTitle').textContent = titleId ? `Patient ${titleId}` : `Patient ${idx+1}`;

  // Build table like your screenshot: left = field, right = value
  const table = document.createElement('table');
  table.id = 'patientTable';

  // Show all columns except the last three expert columns if present
  const expertCols = inferExpertColumns();
  const hideSet = new Set(expertCols);
  const keys = Object.keys(p).filter(k => !hideSet.has(k));

  for(const k of keys){
    const tr = document.createElement('tr');
    const th = document.createElement('th'); th.textContent = k;
    const td = document.createElement('td'); td.textContent = p[k];
    tr.append(th,td);
    table.appendChild(tr);
  }

  const wrap = $('#patientTableWrap');
  wrap.innerHTML = '';
  wrap.appendChild(table);

  // preset inputs if we already submitted from this browser
  const key = titleId ? String(titleId) : String(idx);
  const wasSubmitted = !!submittedIds[key];
  $('#allowResubmit').checked = false;
  $('#saveSubmitBtn').disabled = wasSubmitted;
  $('#status').textContent = wasSubmitted ? 'Already submitted from this browser. Enable “Allow re‑submit” to send again.' : '';
  $('#status').className = 'status';

  // reset inputs
  $('#outcome').value = '';
  $all('input[name="confidence"]').forEach(r => r.checked = false);
  $('#snotSlider').value = 55;
  $('#snotValue').textContent = '55';
}

function inferExpertColumns(){
  // If your CSV already contains three expert columns, we hide them in the table display.
  // We try common names; adjust here if your header uses other names.
  const common = ['expert_outcome','expert_confidence','expert_snot22_postop'];
  const header = patients.meta.header;
  // If any of the common ones exist, use those. Else, attempt to use the last three columns.
  const found = common.filter(c => header.includes(c));
  if(found.length === 3) return found;
  // fallback: last 3
  return header.slice(-3);
}

async function submitAndNext(){
  const p = patients[idx];

  const outcome = $('#outcome').value;
  const confRadio = $all('input[name="confidence"]').find(r => r.checked);
  const confidence = confRadio ? confRadio.value : '';
  const snot = $('#snotSlider').value;

  if(!outcome || !confidence){
    flash('Please select an outcome and a confidence choice.', true);
    return;
  }
  if(!endpoint){
    flash('Please paste and save your backend endpoint URL (top-right).', true);
    return;
  }

  // Construct payload
  const payload = {
    _meta: { ts: Date.now() },
    patient_index: idx,
    patient_key: patientKey(p) ?? null,
    answers: {
      outcome: outcome,
      confidence: confidence,
      snot22_postop: Number(snot)
    },
    // Also include the row's source data for context if needed in the sheet
    row: p
  };

  // Prevent duplicate unless explicitly allowed
  const key = (payload.patient_key ?? String(idx));
  if(submittedIds[key] && !$('#allowResubmit').checked){
    flash('Already submitted from this browser for this patient. Check “Allow re‑submit” to send again.', true);
    return;
  }

  try{
    $('#saveSubmitBtn').disabled = true;
    const resp = await fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const text = await resp.text();
    if(!resp.ok){
      throw new Error(text || `HTTP ${resp.status}`);
    }
    submittedIds[key] = true;
    saveLocalState();
    flash('Saved!', false);
    // go next automatically
    idx = Math.min(idx+1, patients.length-1);
    saveLocalState();
    renderPatient();
  }catch(err){
    console.error(err);
    flash('Error: '+err.message, true);
  }finally{
    $('#saveSubmitBtn').disabled = false;
  }
}

function flash(msg, isErr){
  const el = $('#status');
  el.textContent = msg;
  el.className = 'status ' + (isErr ? 'err' : 'ok');
}

async function main(){
  loadLocalState();

  $('#saveEndpointBtn').addEventListener('click', () => {
    endpoint = $('#endpointInput').value.trim();
    saveLocalState();
    flash('Endpoint saved locally.', false);
  });
  $('#prevBtn').addEventListener('click', () => { idx = Math.max(0, idx-1); saveLocalState(); renderPatient(); });
  $('#nextBtn').addEventListener('click', () => { idx = Math.min(patients.length-1, idx+1); saveLocalState(); renderPatient(); });
  $('#saveSubmitBtn').addEventListener('click', submitAndNext);
  $('#snotSlider').addEventListener('input', e => $('#snotValue').textContent = e.target.value);

  const parsed = await loadCSV();
  patients = parsed.rows;
  patients.meta = { header: parsed.header };
  renderPatient();
}

main();
