/* Doar pentru aplicația Android (.apk): versiune și actualizări din GitHub */
(function () {
  'use strict';
  var APP_BUILD = 0;                       // înlocuit automat de GitHub la construire
  var REPO = 'luchianul/etime';
  var isAnd = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!isAnd) return;

  function box(title, msg, yes, onYes, no) {
    if (document.getElementById('updbox')) return;
    var d = document.createElement('div'); d.id = 'updbox';
    d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center';
    d.innerHTML = '<div style="background:#fff;border-radius:14px;padding:22px 24px;max-width:380px;width:90%;font-family:Arial,sans-serif;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.3)">' +
      '<div style="font-size:19px;font-weight:bold;margin-bottom:8px">' + title + '</div>' +
      '<div style="font-size:14px;color:#555;margin-bottom:18px;line-height:1.5">' + msg + '</div>' +
      '<button id="updyes" style="background:#6366f1;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:16px;margin:4px">' + yes + '</button>' +
      '<button id="updno" style="background:#e5e7eb;color:#333;border:0;border-radius:10px;padding:12px 20px;font-size:16px;margin:4px">' + (no || 'Mai târziu') + '</button></div>';
    document.body.appendChild(d);
    d.querySelector('#updno').onclick = function () { d.remove(); };
    d.querySelector('#updyes').onclick = function () { d.remove(); onYes(); };
  }
  function openUrl(u) { var B = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser; if (B) B.open({ url: u }); else window.open(u, '_blank'); }
  function downloadApk(u, name) {
    var U = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.UpdatePlugin;
    if (!U) { openUrl(u); return; }
    U.download({ url: u, name: name }).then(function () {
      alert('Descărcarea a început.\nCând se termină, atinge notificarea „' + name + '” (sus) și apasă Instalează.\nDatele tale rămân.');
    }).catch(function () { openUrl(u); });
  }
  var manual = false;
  function say(m) { if (manual) alert(m); }

  async function check(man) {
    manual = !!man;
    if (!APP_BUILD) { say('Această variantă nu are număr de versiune.'); return; }
    try {
      var r2 = await fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
      if (!r2.ok) throw new Error('HTTP ' + r2.status);
      var j = await r2.json(), n = parseInt(String(j.tag_name || '').replace(/\D+/g, ''), 10) || 0;
      if (n <= APP_BUILD) { say('Ai cea mai nouă versiune (' + APP_BUILD + ').'); return; }
      var a = (j.assets || []).find(function (x) { return /\.apk$/i.test(x.name); });
      if (!a || a.browser_download_url.indexOf('https://github.com/' + REPO + '/') !== 0) { say('Versiunea nouă nu are încă fișierul pentru telefon.'); return; }
      box('Versiune nouă disponibilă', 'Ai versiunea ' + APP_BUILD + ', a apărut versiunea ' + n + '.<br>Vrei să actualizezi acum?<br><small>Datele tale rămân. După ce se descarcă fișierul, deschide-l și apasă „Instalează”.</small>', 'Da, actualizează', function () { downloadApk(a.browser_download_url, a.name); });
    } catch (e) { say('Nu pot verifica acum. Ai internet?'); }
  }

  window.utNativeHtml = function () {
    return '<div style="margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">Versiunea instalată: <b>' + (APP_BUILD || 'dev') + '</b> ' +
      '<button type="button" id="ut-upd" style="margin-left:6px;background:#6366f1;color:#fff;border:0;border-radius:8px;padding:6px 12px;font-size:13px">Caută actualizări</button></div>';
  };
  document.addEventListener('click', function (e) { if (e.target && e.target.id === 'ut-upd') { if (window.Swal) Swal.close(); check(true); } });
  window.addEventListener('load', function () { setTimeout(function () { check(false); }, 4000); });
})();
