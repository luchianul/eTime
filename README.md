# Utility Pro

Consum electricitate și gaz, cu datele în Google Sheet. Proiect separat de eTime (alt `appId`, altă cheie de semnare).

## Cum e făcut
- `src/Index.html` și `src/Code.gs` — varianta din Apps Script (pagina web, plan B). Aici se fac modificările.
- `build.py` — din `src/Index.html` produce `app/index.html` (biblioteci locale, adaptor de sincronizare, manifest).
- `app/` — aplicația instalabilă (PWA / Android). `ut-api.js` face ca `google.script.run` să vorbească cu Apps Script prin internet și să lucreze și fără semnal.
- `android-src/`, `capacitor.config.json`, `.github/workflows/build.yml` — APK construit automat de GitHub la fiecare push pe `main` (se publică în Releases ca `UtilityPro-N.apk`).
- `test/` — test de cap la cap: `python3 test/test_app.py` (rulează `Code.gs` real într-un Sheet simulat și aplicația în Chrome).

## După o modificare
1. Editezi `src/Index.html` (și `src/Code.gs` dacă e nevoie).
2. `python3 build.py`
3. `python3 test/test_app.py`
4. Commit + push → GitHub construiește APK-ul.
5. Dacă ai schimbat `Code.gs` sau `Index.html` pentru pagina web: le copiezi în Apps Script și faci „Gestionează implementările” → creion → „Versiune nouă” (linkul `/exec` rămâne același).

## Prima configurare în aplicație
Setări → „Setează / schimbă adresa” → lipești linkul `/exec` al aplicației web din Apps Script.
