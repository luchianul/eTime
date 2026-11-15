#!/usr/bin/env python3
"""Transforma src/Index.html (varianta din Apps Script) in app/index.html (aplicatia instalabila):
bibliotecile se iau local, se adauga adaptorul de sincronizare, manifestul si service worker-ul.
Rulare:  python3 build.py"""
import os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(ROOT, 'src', 'Index.html'), encoding='utf-8').read()

def rep(old, new):
    global src
    if src.count(old) != 1:
        sys.exit('build.py: nu gasesc exact o data: ' + old[:70])
    src = src.replace(old, new)

# biblioteci locale (merg si fara internet)
rep('    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">\n', '    <link href="lib/fonts.css" rel="stylesheet">\n')
rep('    <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap" rel="stylesheet">\n', '')
rep('<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>', '<script src="lib/chart.umd.min.js"></script>')
rep('<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>', '<script src="lib/sweetalert2.all.min.js"></script>')

# PWA: manifest, culori, adaptor de sincronizare, actualizari Android
rep('    <title>Utility Pro Gabriel</title>', '''    <title>Utility Pro</title>
    <link rel="manifest" href="manifest.webmanifest">
    <meta name="theme-color" content="#6366f1">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-title" content="Utility Pro">
    <link rel="apple-touch-icon" href="icon-192.png">
    <script src="ut-api.js"></script>
    <script src="native.js"></script>''')
rep('</body>', '''<script>
if ('serviceWorker' in navigator && !window.Capacitor && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
}
</script>
</body>''')

open(os.path.join(ROOT, 'app', 'index.html'), 'w', encoding='utf-8').write(src)
print('app/index.html scris (%d caractere)' % len(src))
