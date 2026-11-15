"""Test de cap la cap: aplicatia (Chrome) + Code.gs real (rulat in mock_apps_script.js).
Rulare:  python3 test/test_app.py"""
import json, os, subprocess, sys, threading, time, functools, http.server, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOCK, WEB = 8090, 8080
fails = []

def check(name, cond, extra=''):
    print(('OK   ' if cond else 'FAIL ') + name + ((' -> ' + str(extra)) if (extra != '' and not cond) else ''))
    if not cond: fails.append(name)

def rows():
    return json.loads(urllib.request.urlopen('http://localhost:%d/__rows' % MOCK).read())

mock = subprocess.Popen(['node', os.path.join(ROOT, 'test', 'mock_apps_script.js'), str(MOCK)], stdout=subprocess.PIPE, text=True)
mock.stdout.readline()
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=os.path.join(ROOT, 'app'))
handler.log_message = lambda *a, **k: None
srv = http.server.ThreadingHTTPServer(('localhost', WEB), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 390, 'height': 800})
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.clock.set_fixed_time('2026-11-15T12:00:00')
        page.goto('http://localhost:%d/?u=http://localhost:%d/exec' % (WEB, MOCK))
        page.wait_for_function("document.getElementById('lElec').innerText !== '0'", timeout=15000)

        check('landing: electricitate = 160+640', page.inner_text('#lElec') == '800', page.inner_text('#lElec'))
        check('landing: gaz = 500', page.inner_text('#lGaz') == '500', page.inner_text('#lGaz'))
        check('landing: luna curenta, nu „Se incarca”', page.inner_text('#landing-month').strip().lower() in ('noiembrie 2026',), page.inner_text('#landing-month'))
        check('body are clasa ut-pwa (card sincronizare vizibil)', page.evaluate("document.body.classList.contains('ut-pwa')"))
        page.click('.btn-connect-white')
        page.wait_for_timeout(1000)

        # citire noua electricitate, online
        page.click('.bottom-nav >> text=Adaugă')
        check('data de azi e cea locala', page.input_value('#fData') == '2026-11-15', page.input_value('#fData'))
        page.fill('#fData', '2026-11-14'); page.fill('#fIdx1', '1600'); page.fill('#fIdx2', '850')
        page.click('.btn-save')
        page.wait_for_function("document.getElementById('currElec').innerText === '950'", timeout=15000)
        page.wait_for_timeout(1500)
        r = rows()
        check('server: un rand nou electricitate', len(r) == 7, len(r))
        check('server: consum 150', r[-1][5] == 150, r[-1])

        # index mai mic decat ultimul -> avertisment
        page.click('.bottom-nav >> text=Adaugă')
        page.fill('#fIdx1', '1000'); page.fill('#fIdx2', '850'); page.click('.btn-save')
        page.wait_for_selector('text=Indexul e mai mic decât ultimul', timeout=5000)
        check('avertisment index mai mic', True)
        page.click('text=Revin')
        check('nimic scris dupa „Revin”', len(rows()) == 7, len(rows()))

        # fara internet: citire gaz se salveaza local, apoi se trimite
        ctx.set_offline(True)
        page.fill('#fData', '2026-11-14'); page.select_option('#fServiciu', 'Gaz'); page.fill('#fIdx1', '760'); page.click('.btn-save')
        page.wait_for_function("document.getElementById('currGaz').innerText === '560'", timeout=15000)
        check('offline: apare imediat local (500+60)', True)
        check('offline: serverul nu a primit nimic', len(rows()) == 7, len(rows()))
        check('offline: in coada', len(json.loads(page.evaluate("localStorage.getItem('ut_queue')"))) == 1)
        ctx.set_offline(False)
        page.evaluate("window.dispatchEvent(new Event('online'))")
        page.wait_for_function("JSON.parse(localStorage.getItem('ut_queue')).length === 0", timeout=20000)
        page.wait_for_timeout(1000)
        r = rows()
        check('dupa revenirea semnalului: un singur rand nou', len(r) == 8, len(r))
        check('server: consum gaz 60', r[-1][1] == 'Gaz' and r[-1][6] == 60, r[-1])

        # aceeasi operatie trimisa de doua ori -> o singura scriere (opId)
        body = json.dumps({'fn': 'saveData', 'args': [{'luna': '2026-11-15', 'serviciu': 'Gaz', 'idxZi': '', 'idxNoapte': '', 'idxGaz': '800'}], 'opId': 'test-dup-1'}).encode()
        for _ in range(2): urllib.request.urlopen(urllib.request.Request('http://localhost:%d/exec' % MOCK, body, {'Content-Type': 'text/plain'})).read()
        check('opId duplicat nu dubleaza randul', len(rows()) == 9, len(rows()))

        # functie necunoscuta e refuzata
        body = json.dumps({'fn': 'deleteEverything', 'args': []}).encode()
        resp = json.loads(urllib.request.urlopen(urllib.request.Request('http://localhost:%d/exec' % MOCK, body, {'Content-Type': 'text/plain'})).read())
        check('functie necunoscuta refuzata', 'error' in resp, resp)

        # setari comune: prețul se salveaza pe server si apare pe alt dispozitiv
        props0 = json.loads(urllib.request.urlopen('http://localhost:%d/__props' % MOCK).read())
        check('serverul nu avea setari inainte', 'settings' not in props0, props0)
        page.click('.bottom-nav >> text=Setări')
        page.fill('#cfgPretE', '0.42'); page.press('#cfgPretE', 'Tab')
        page.wait_for_timeout(2500)
        sv = json.loads(json.loads(urllib.request.urlopen('http://localhost:%d/__props' % MOCK).read()).get('settings', 'null'))
        check('setari pe server: pret 0.42', sv and sv['pretE'] == 0.42, sv)
        check('setari pe server: ciclul porneste de la 2026-05-22', sv and sv['startDate'] == '2026-05-22', sv)

        ctx2 = b.new_context(viewport={'width': 390, 'height': 800})
        pg2 = ctx2.new_page(); pg2.clock.set_fixed_time('2026-11-15T12:00:00')
        pg2.goto('http://localhost:%d/?u=http://localhost:%d/exec' % (WEB, MOCK))
        pg2.wait_for_function("document.getElementById('cfgPretE').value === '0.42'", timeout=15000)
        check('alt dispozitiv primeste pretul de pe server', True)
        props1 = json.loads(urllib.request.urlopen('http://localhost:%d/__props' % MOCK).read())
        check('dispozitiv nou fara setari proprii nu suprascrie serverul', json.loads(props1['settings'])['pretE'] == 0.42)

        # data de pornire a ciclului din Setari decide ce se aduna (rand de pornire exclus)
        pg2.click('.btn-connect-white'); pg2.wait_for_timeout(1000); pg2.click('.bottom-nav >> text=Setări')
        pg2.fill('#cfgStartDate', '2026-06-22'); pg2.press('#cfgStartDate', 'Tab')
        pg2.wait_for_function("document.getElementById('currElec').innerText === '790'", timeout=10000)
        check('start 22 iunie: 640 + 150 = 790 kWh', True)
        check('fara avertisment de ciclu vechi', 'hidden' in pg2.get_attribute('#cycleWarn', 'class'))
        pg2.fill('#cfgStartDate', '2025-01-01'); pg2.press('#cfgStartDate', 'Tab')
        pg2.wait_for_function("!document.getElementById('cycleWarn').classList.contains('hidden')", timeout=10000)
        check('avertisment cand ciclul are peste un an', True)
        pg2.fill('#cfgStartDate', '2026-05-22'); pg2.press('#cfgStartDate', 'Tab')
        ctx2.close()

        # adresa gresita in dialog
        page.click('.bottom-nav >> text=Setări'); page.click('text=Setează / schimbă adresa')
        page.fill('#ut-url', 'http://exemplu.ro'); page.click('text=Salvează și sincronizează')
        page.wait_for_selector('.swal2-validation-message', timeout=5000)
        check('adresa invalida e refuzata', 'script.google.com' in page.inner_text('.swal2-validation-message'))
        check('fara erori JS in pagina', not errs, errs)
        page.screenshot(path='/tmp/ut-settings.png')
        b.close()
finally:
    srv.shutdown(); mock.terminate()

print('\n%s' % ('TOATE TESTELE AU TRECUT' if not fails else 'ESUATE: ' + ', '.join(fails)))
sys.exit(1 if fails else 0)
