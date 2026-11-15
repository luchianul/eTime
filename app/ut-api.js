/* ============================================================
   ut-api.js — în aplicația instalată / PWA, google.script.run vorbește cu Apps Script prin internet
   și lucrează și FĂRĂ semnal:
     • citirile vin din memoria locală dacă nu e internet;
     • o citire nouă se aplică imediat local și se pune într-o coadă; se trimite singură când revine semnalul;
     • fiecare operație are un opId: o reîncercare nu poate dubla nimic în Sheet.
   În Apps Script (obiectul „google” real există) acest fișier nu face nimic.
   ============================================================ */
(function () {
  'use strict';
  if (window.google && window.google.script && window.google.script.run) return;

  var K_URL = 'ut_url', K_CACHE = 'ut_cache', K_Q = 'ut_queue', K_FAIL = 'ut_failed';
  var ls = window.localStorage;

  function lsGet(k) { try { return ls.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { ls.setItem(k, v); return true; } catch (e) { return false; } }
  function ld(k, d) { try { var v = JSON.parse(lsGet(k)); return v === null || v === undefined ? d : v; } catch (e) { return d; } }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function rid(p) { return (p || 'o') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
  function num(v) { var n = parseFloat(String(v === null || v === undefined ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; }
  function r3(x) { return Math.round(x * 1000) / 1000; }

  try { var qs = new URLSearchParams(location.search), uu = qs.get('u'); if (uu) { lsSet(K_URL, uu.trim()); qs.delete('u'); history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs : '') + location.hash); } } catch (e) {}   // adresa se poate da printr-un link: ?u=…

  var cache = ld(K_CACHE, { rows: null });
  var queue = ld(K_Q, []);
  var failed = ld(K_FAIL, []);
  function save() { lsSet(K_CACHE, JSON.stringify(cache)); lsSet(K_Q, JSON.stringify(queue)); lsSet(K_FAIL, JSON.stringify(failed)); chip(); }

  function url() { return (lsGet(K_URL) || '').trim(); }
  function online() { return navigator.onLine !== false; }
  function urlOk(u) { return /^https:\/\/script\.google\.com\/(a\/[^\/]+\/)?macros\/s\/[^\/]+\/exec$/.test(u); }

  // ---------- rețea ----------
  function post(fn, args, opId) {
    var ctrl = window.AbortController ? new AbortController() : null, t = ctrl && setTimeout(function () { ctrl.abort(); }, 60000);
    return fetch(url(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow',
      body: JSON.stringify({ fn: fn, args: args || [], opId: opId || null }), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) { clearTimeout(t); if (j && j.error) { var e = new Error(j.error); e.server = true; throw e; } return j || {}; },
            function (e) { clearTimeout(t); throw e; });
  }

  // ---------- aceeași regulă ca pe server (Code.gs → saveData) ----------
  function applyLocal(p) {
    var rows = cache.rows || (cache.rows = []), cE = 0, cG = 0, i;
    var z = num(p.idxZi), n = num(p.idxNoapte), g = num(p.idxGaz);
    if (p.serviciu === 'Electricitate') {
      var lz = 0, ln = 0;
      for (i = rows.length - 1; i >= 0; i--) if (rows[i][1] === 'Electricitate') { lz = num(rows[i][2]); ln = num(rows[i][3]); break; }
      if (lz > 0) cE = r3((z - lz) + (n - ln));
    } else {
      var lg = 0;
      for (i = rows.length - 1; i >= 0; i--) if (rows[i][1] === 'Gaz') { lg = num(rows[i][4]); break; }
      if (lg > 0) cG = r3(g - lg);
    }
    rows.push([p.luna, p.serviciu, p.serviciu === 'Electricitate' ? z : '', p.serviciu === 'Electricitate' ? n : '', p.serviciu === 'Gaz' ? g : '', cE, cG]);
  }

  // ---------- coada de operații ----------
  function enqueue(fn, args) { queue.push({ id: rid('o'), fn: fn, args: clone(args), ts: Date.now(), tries: 0 }); save(); setTimeout(flush, 30); }

  var flushing = null;
  function flush() {
    if (flushing) return flushing;
    if (!url() || !online() || !queue.length) return Promise.resolve(!queue.length);
    chip('sync');
    function step() {
      if (!queue.length) return Promise.resolve(true);
      var op = queue[0];
      return post(op.fn, op.args, op.id).then(function () { queue.shift(); save(); return step(); }, function (e) {
        if (e && e.server) {                                          // serverul a refuzat operația: după 3 încercări o punem deoparte, ca să nu blocheze coada
          op.tries = (op.tries || 0) + 1;
          if (op.tries >= 3) { failed.push({ op: op, err: String(e.message), ts: Date.now() }); queue.shift(); save(); try { window.dispatchEvent(new CustomEvent('ut-failed')); } catch (x) {} return step(); }
          save();
        }
        return false;                                                 // fără rețea / eroare: rămâne în coadă, se reîncearcă
      });
    }
    flushing = step().then(function (okAll) {
      flushing = null;
      if (!okAll || queue.length) { chip(); return false; }
      return post('getSheetData', []).then(function (j) {              // coada e goală: răspunsul serverului e adevărul
        var changed = JSON.stringify(cache.rows) !== JSON.stringify(j.result);
        cache.rows = j.result || []; save(); chip('done');
        if (changed) { try { window.dispatchEvent(new CustomEvent('ut-synced')); } catch (x) {} }
        return true;
      }, function () { chip(); return true; });
    });
    return flushing;
  }

  // ---------- citiri ----------
  function ok(h, v) { setTimeout(function () { h.success && h.success(clone(v)); }, 0); }
  function noSetup(h) { setTimeout(function () { try { window.utSettings(); } catch (x) {} h.failure && h.failure(new Error('Sincronizarea nu e setată')); }, 0); }

  function readRows(h) {
    if (!url()) { if (cache.rows) return ok(h, cache.rows); return noSetup(h); }
    if (queue.length) { if (online()) flush(); return ok(h, cache.rows || []); }        // avem ceva de trimis: arătăm varianta locală, trimiterea merge în fundal
    if (!online()) return localRows(h);
    return post('getSheetData', []).then(function (j) {
      if (queue.length) return ok(h, cache.rows || []);
      cache.rows = j.result || []; save(); ok(h, cache.rows);
    }, function () { localRows(h); });
  }
  function localRows(h) {
    if (cache.rows) return ok(h, cache.rows);
    if (h.failure) h.failure(new Error('Nu ai încă date salvate pe acest dispozitiv. Conectează-te o dată la internet.'));
  }

  // ---------- obiectul google.script.run ----------
  function run() {
    var h = { success: null, failure: null }, o = {
      withSuccessHandler: function (f) { h.success = f; return o; },
      withFailureHandler: function (f) { h.failure = f; return o; },
      withUserObject: function () { return o; },
      getSheetData: function () { readRows(h); },
      saveData: function (p) {
        p = clone(p || {});
        applyLocal(p); enqueue('saveData', [p]);
        ok(h, { success: true });
      }
    };
    return o;
  }
  window.google = { script: { run: new Proxy({}, { get: function (t, k) { var r = run(); return r[k]; } }) } };

  // ---------- indicator mic + setări ----------
  var chipEl = null, chipTimer = null;
  function chip(state) {
    if (!document.body) return;
    if (!chipEl) {
      chipEl = document.createElement('div'); chipEl.id = 'ut-chip';
      chipEl.style.cssText = 'position:fixed;bottom:calc(env(safe-area-inset-bottom,0px) + 84px);left:50%;transform:translateX(-50%);z-index:3000;padding:4px 12px;border-radius:999px;font:600 11px/1.4 "Plus Jakarta Sans",system-ui,sans-serif;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);display:none;cursor:pointer';
      chipEl.onclick = function () { window.utSettings(); };
      document.body.appendChild(chipEl);
    }
    var n = queue.length, bad = failed.length, txt = '', bg = '#475569';
    if (!url()) { txt = 'Setează sincronizarea'; bg = '#b45309'; }
    else if (bad) { txt = '⚠ ' + bad + ' nu s-au putut trimite'; bg = '#b91c1c'; }
    else if (!online()) { txt = '📴 Fără internet' + (n ? ' · ' + n + ' de trimis' : ''); bg = '#334155'; }
    else if (n) { txt = '⟳ Se trimit ' + n + '…'; bg = '#4338ca'; }
    else if (state === 'done') { txt = '✓ Sincronizat'; bg = '#0f766e'; }
    if (!txt) { chipEl.style.display = 'none'; return; }
    chipEl.textContent = txt; chipEl.style.background = bg; chipEl.style.display = 'block';
    clearTimeout(chipTimer);
    if (state === 'done') chipTimer = setTimeout(function () { chipEl.style.display = 'none'; }, 2500);
  }
  window.addEventListener('online', function () { chip(); flush(); });
  window.addEventListener('offline', function () { chip(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) flush(); });
  setInterval(function () { if (queue.length) flush(); }, 30000);
  document.addEventListener('DOMContentLoaded', function () { document.body.classList.add('ut-pwa'); chip(); flush(); });

  function setUrl(u) { u = (u || '').trim(); if (u !== url()) { cache = { rows: null }; lsSet(K_URL, u); save(); } }

  window.utSettings = function () {
    if (!window.Swal) { var u = prompt('Adresa Apps Script (se termină cu /exec):', url()); if (u !== null) { setUrl(u); flush(); } return; }
    var n = queue.length, bad = failed.length;
    Swal.fire({
      title: 'Sincronizează cu Google Sheet-ul tău',
      html: '<div style="text-align:left;font-size:14px"><label style="font-weight:700">Adresa Apps Script (se termină cu /exec)</label>' +
            '<input id="ut-url" class="swal2-input" style="margin:6px 0 10px;width:100%;font-size:13px" value="' + url().replace(/"/g, '&quot;') + '" placeholder="https://script.google.com/macros/s/…/exec">' +
            '<div style="margin-bottom:8px;color:' + (bad ? '#b91c1c' : '#475569') + '">' + (n ? n + ' citiri așteaptă să fie trimise. ' : '') + (bad ? bad + ' nu s-au putut trimite.' : (n ? '' : 'Totul e trimis.')) + '</div>' +
            '<small style="color:#64748b;display:block;margin-bottom:6px">Lipește adresa aplicației web publicate din Sheet (Extensii → Apps Script → Implementează → Aplicație web). Fără internet poți continua să introduci citiri: se trimit singure când revine semnalul.</small>' +
            (window.utNativeHtml ? window.utNativeHtml() : '') + '</div>',
      showCancelButton: true, confirmButtonText: 'Salvează și sincronizează', cancelButtonText: 'Închide',
      preConfirm: function () {
        var u = document.getElementById('ut-url').value.trim();
        if (!urlOk(u)) { Swal.showValidationMessage('Adresa trebuie să înceapă cu https://script.google.com/ și să se termine cu /exec'); return false; }
        setUrl(u);
        return post('getSheetData', []).then(function (j) { if (!queue.length) { cache.rows = j.result || []; save(); } return true; },
          function (e) { Swal.showValidationMessage('Adresa nu răspunde: ' + (e && e.message ? e.message : 'fără internet?')); return false; });
      }
    }).then(function (r) {
      if (r.isConfirmed) { flush(); try { window.dispatchEvent(new CustomEvent('ut-synced')); } catch (x) {} }
    });
  };
})();
