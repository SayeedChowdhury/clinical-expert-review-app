/**
 * Google Apps Script backend for the Clinical Expert Review app.
 * Creates (or opens) a Google Sheet named SHEET_NAME and appends JSON payloads.
 * Deploy as a Web App: "Anyone with the link" can access.
 */
const SHEET_NAME = 'ClinicalExpertReview_Submissions';

function _getSheet(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if(!sh){ sh = ss.insertSheet(SHEET_NAME); }
  // Setup header if empty
  if(sh.getLastRow() === 0){
    sh.appendRow([
      'timestamp','patient_index','patient_key',
      'outcome','confidence','snot22_postop','payload_json'
    ]);
  }
  return sh;
}

function doPost(e){
  try{
    const body = e.postData && e.postData.contents ? e.postData.contents : '{}';
    const data = JSON.parse(body);

    const sh = _getSheet();
    const ts = new Date();
    sh.appendRow([
      ts,
      data.patient_index ?? '',
      data.patient_key ?? '',
      data.answers?.outcome ?? '',
      data.answers?.confidence ?? '',
      data.answers?.snot22_postop ?? '',
      JSON.stringify(data)
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ok:true}))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader('Access-Control-Allow-Origin','*');
  }catch(err){
    return ContentService
      .createTextOutput(JSON.stringify({ok:false,error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader('Access-Control-Allow-Origin','*');
  }
}

function doGet(){
  // Basic health check
  return ContentService
    .createTextOutput(JSON.stringify({ok:true, service:'ClinicalExpertReview'}))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin','*');
}
