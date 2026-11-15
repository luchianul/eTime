/**
 * Utility Pro — server Apps Script.
 *
 * Două moduri de folosire, același Sheet:
 *  1) Pagina web (plan B): linkul /exec deschide index.html, care folosește google.script.run.
 *  2) Aplicația instalată (APK / PWA): trimite cereri POST către același link /exec.
 *
 * Coloane în foaie (prima foaie): A data | B serviciu | C index zi | D index noapte | E index gaz | F consum elec | G consum gaz
 */

var ANTET = ['Data', 'Serviciu', 'Index Zi', 'Index Noapte', 'Index Gaz', 'Consum Elec (kWh)', 'Consum Gaz (m3)'];

function doGet() {
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('Utility Analytics Pro - Gabriel')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Funcțiile pe care aplicația instalată are voie să le cheme. */
var API = { getSheetData: getSheetData, saveData: saveData };

/**
 * Cerere de la aplicația instalată: { fn, args, opId }.
 * opId = număr unic al operației; dacă aplicația reîncearcă o trimitere (semnal slab),
 * aceeași operație nu se scrie de două ori în Sheet.
 */
function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    if (!Object.prototype.hasOwnProperty.call(API, req.fn)) throw new Error('Funcție necunoscută: ' + req.fn);
    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      if (req.opId && opVazut_(req.opId)) {
        out = { result: getSheetData(), dup: true };
      } else {
        var rezultat = API[req.fn].apply(null, req.args || []);
        if (req.opId) opRetine_(req.opId);
        out = { result: rezultat };
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    out = { error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function foaie_() {
  return SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
}

function rotunjeste_(x) {
  return Math.round(x * 1000) / 1000;   // fără 12.300000000000011
}

/**
 * Salvează o citire și calculează consumul față de ultima citire de același fel.
 */
function saveData(data) {
  var sheet = foaie_();
  if (sheet.getLastRow() === 0) sheet.appendRow(ANTET);
  var allData = sheet.getDataRange().getValues();

  var consElec = 0;
  var consGaz = 0;

  var currentIdxZi = parseFloat(data.idxZi) || 0;
  var currentIdxNoapte = parseFloat(data.idxNoapte) || 0;
  var currentIdxGaz = parseFloat(data.idxGaz) || 0;

  if (data.serviciu === 'Electricitate') {
    var lastZi = 0, lastNoapte = 0;
    for (var i = allData.length - 1; i >= 1; i--) {
      if (allData[i][1] === 'Electricitate') {
        lastZi = parseFloat(allData[i][2]) || 0;
        lastNoapte = parseFloat(allData[i][3]) || 0;
        break;
      }
    }
    if (lastZi > 0) consElec = rotunjeste_((currentIdxZi - lastZi) + (currentIdxNoapte - lastNoapte));
  } else if (data.serviciu === 'Gaz') {
    var lastGaz = 0;
    for (var j = allData.length - 1; j >= 1; j--) {
      if (allData[j][1] === 'Gaz') {
        lastGaz = parseFloat(allData[j][4]) || 0;
        break;
      }
    }
    if (lastGaz > 0) consGaz = rotunjeste_(currentIdxGaz - lastGaz);
  } else {
    throw new Error('Serviciu necunoscut: ' + data.serviciu);
  }

  sheet.appendRow([
    data.luna,
    data.serviciu,
    data.serviciu === 'Electricitate' ? currentIdxZi : '',
    data.serviciu === 'Electricitate' ? currentIdxNoapte : '',
    data.serviciu === 'Gaz' ? currentIdxGaz : '',
    consElec,
    consGaz
  ]);

  return { success: true };
}

/**
 * Toate rândurile (fără antet), datele ca text yyyy-MM-dd.
 */
function getSheetData() {
  var values = foaie_().getDataRange().getValues();
  if (values.length <= 1) return [];
  var tz = Session.getScriptTimeZone();
  return values.slice(1).map(function (row) {
    return row.map(function (cell) {
      return cell instanceof Date ? Utilities.formatDate(cell, tz, 'yyyy-MM-dd') : cell;
    });
  });
}

// ---------- memoria operațiilor deja primite (ultimele 200) ----------
function opVazut_(id) {
  return opLista_().indexOf(String(id)) !== -1;
}

function opRetine_(id) {
  var l = opLista_();
  l.push(String(id));
  PropertiesService.getScriptProperties().setProperty('ops', JSON.stringify(l.slice(-200)));
}

function opLista_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('ops') || '[]'); }
  catch (e) { return []; }
}
