// Strategia „najpierw pamięć podręczna", z pamięcią nazwaną numerem wersji.
//
// Wcześniej było odwrotnie: najpierw sieć, a pamięć tylko awaryjnie. Brzmiało
// bezpiecznie, ale decyzja zapadała OSOBNO DLA KAŻDEGO PLIKU — wystarczyło,
// że jedno pobranie się nie powiodło, by aplikacja dostała ten jeden plik ze
// starego wydania, a resztę z nowego. Taka mieszanka wywalała trening
// komunikatem o braku elementu, którego nowszy kod już nie tworzy.
//
// Teraz wszystko idzie z jednej pamięci, wypełnianej przy instalacji w trybie
// wszystko-albo-nic (addAll) i nazwanej numerem wersji. Zestaw plików jest
// więc zawsze spójny i pochodzi z jednego wydania. Nowe pliki przychodzą przez
// wymianę service workera, a nie przez podmianę pojedynczych żądań — to
// działa, odkąd numer wersji siedzi w adresie skryptu.

import { VERSION } from './js/version.js';

const CACHE = 'ziprun-' + VERSION;
const ASSETS = [
  './',
  'index.html',
  'app.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/plans.js',
  'js/engine.js',
  'js/speech.js',
  'js/storage.js',
  'js/version.js',
  'js/trace.js',
  'js/generator.js',
  'js/tekst.js',
  'js/editor/model.js',
  'js/editor/link.js',
  'js/editor/app.js',
  'edit.html',
  'js/ui/import.js',
  'js/ui/core.js',
  'js/ui/nav.js',
  'js/ui/charts.js',
  'js/ui/plan-list.js',
  'js/ui/creator.js',
  'js/ui/run.js',
  'js/ui/summary.js',
  'js/ui/history.js',
  'js/ui/profile.js',
  'js/ui/device.js',
  'js/ui/changelog.js',
  'js/ble/uuids.js',
  'js/ble/ftms.js',
  'js/ble/proprietary.js',
  'js/ble/diagnostics.js',
  'js/ble/manager.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // cache:'reload' omija pamięć HTTP — inaczej przy instalacji nowej
      // wersji mogłyby tu wpaść pliki poprzedniej, prosto z pamięci przeglądarki.
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // Edytor ma ładny adres /edit, a w pamięci leży jako edit.html. Bez tego
  // edytor szedłby z sieci, a jego moduły z pamięci — czyli z dwóch wydań.
  const url = new URL(req.url);
  const klucz = url.pathname.endsWith('/edit') ? new URL('edit.html', self.registration.scope).href : req;

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const zPamieci = await cache.match(klucz, { ignoreSearch: true });
      if (zPamieci) return zPamieci;

      try {
        const zSieci = await fetch(req);
        // Dokładamy tylko udane odpowiedzi i tylko w obrębie bieżącej wersji.
        if (zSieci.ok) cache.put(req, zSieci.clone());
        return zSieci;
      } catch (err) {
        // Wejście na dowolny adres aplikacji ma otworzyć aplikację, nawet bez sieci.
        if (req.mode === 'navigate') {
          const shell = await cache.match('index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })
  );
});
