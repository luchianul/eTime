// Ruleaza Code.gs REAL intr-un mediu de test (fara Google): foaie in memorie + HTTP pe portul dat.
// Folosire: node test/mock_apps_script.js 8090
const vm = require('vm'), fs = require('fs'), http = require('http'), path = require('path');
const port = +process.argv[2] || 8090;
const d = (s) => new Date(s + 'T12:00:00Z');
const ANTET = ['Data', 'Serviciu', 'Index Zi', 'Index Noapte', 'Index Gaz', 'Consum Elec (kWh)', 'Consum Gaz (m3)'];
function seed() {
  return [ANTET,
    [d('2026-05-22'), 'Electricitate', 1000, 500, '', 0, 0],
    [d('2026-06-22'), 'Electricitate', 1100, 560, '', 160, 0],
    ['2026-10-01', 'Electricitate', 1500, 800, '', 640, 0],
    [d('2026-05-22'), 'Gaz', '', '', 200, 0, 0],
    ['2026-10-01', 'Gaz', '', '', 700, 0, 500]];
}
let sheet = seed(), props = {};
const sheetObj = {
  getLastRow: () => sheet.length,
  appendRow: (r) => { sheet.push(r); },
  getDataRange: () => ({ getValues: () => sheet.map(r => r.slice()) }),
};
const out = (s) => ({ s, setMimeType() { return this; }, getContent() { return this.s; } });
const ctx = {
  console, JSON, Math, Date, parseFloat, String, Error, Object, Array,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getActiveSheet: () => sheetObj }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
  ContentService: { createTextOutput: out, MimeType: { JSON: 'json' } },
  Utilities: { formatDate: (dt) => dt.toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => 'UTC' },
  HtmlService: {},
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'Code.gs'), 'utf8'), ctx);
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    if (req.url.startsWith('/__rows')) { res.end(JSON.stringify(sheet)); return; }
    if (req.url.startsWith('/__reset')) { sheet = seed(); props = {}; res.end('ok'); return; }
    if (req.url.startsWith('/__down')) { global.DOWN = true; res.end('ok'); return; }
    const o = ctx.doPost({ postData: { contents: body } });
    res.setHeader('Content-Type', 'application/json');
    res.end(o.getContent());
  });
}).listen(port, () => console.log('mock pe ' + port));
