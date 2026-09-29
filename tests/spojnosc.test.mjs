// Spójność plików aplikacji. Nie da się tego zobaczyć w przeglądarce na
// komputerze, bo tam wszystko przychodzi z sieci — błąd wychodzi dopiero na
// telefonie, offline, gdy service worker nie ma w pamięci jednego z modułów.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const czytaj = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Wszystkie moduły osiągalne importami z danego pliku. */
function grafModulow(start) {
  const widziane = new Set();
  const kolejka = [start];
  while (kolejka.length) {
    const plik = kolejka.pop();
    if (widziane.has(plik)) continue;
    widziane.add(plik);
    // Także `export { … } from` — moduł przekazany dalej też musi być w pamięci.
    for (const m of czytaj(plik).matchAll(/^\s*(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm)) {
      kolejka.push(path.posix.normalize(path.posix.join(path.posix.dirname(plik), m[1])));
    }
  }
  return widziane;
}

// Dwa punkty wejścia: aplikacja na telefonie i edytor planów na komputerze.
const WEJSCIA = [
  { js: 'js/app.js', html: 'index.html' },
  { js: 'js/editor/app.js', html: 'edit.html' },
];
const wszystkieModuly = () => new Set(WEJSCIA.flatMap((w) => [...grafModulow(w.js)]));

const assetsSw = () => {
  const blok = czytaj('sw.js').match(/const ASSETS = \[([\s\S]*?)\];/)[1];
  return [...blok.matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

test('każdy moduł aplikacji i edytora jest w pamięci offline service workera', () => {
  const assets = new Set(assetsSw());
  const brak = [...wszystkieModuly(), ...WEJSCIA.map((w) => w.html)].filter((m) => !assets.has(m));
  assert.deepEqual(brak, [], 'dopisz do ASSETS w sw.js');
});

test('każda strona ładuje swój punkt wejścia', () => {
  for (const w of WEJSCIA) {
    assert.match(czytaj(w.html), new RegExp('<script type="module" src="' + w.js.replace(/\//g, '\\/') + '">'), w.html);
  }
});

test('każdy plik z listy service workera istnieje', () => {
  // addAll działa w trybie wszystko-albo-nic: jeden brakujący plik i nowa
  // wersja w ogóle się nie zainstaluje.
  const brak = assetsSw().filter((a) => a !== './' && !fs.existsSync(path.join(ROOT, a)));
  assert.deepEqual(brak, []);
});

test('każda importowana nazwa jest eksportowana przez swój moduł', () => {
  const eksporty = (plik) => {
    const s = czytaj(plik);
    const out = new Set();
    for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([\w$]+)/g)) out.add(m[1]);
    for (const m of s.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const n of m[1].split(',')) out.add(n.trim().split(/\s+as\s+/).pop());
    }
    return out;
  };
  const problemy = [];
  for (const plik of wszystkieModuly()) {
    for (const m of czytaj(plik).matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
      const zrodlo = path.posix.normalize(path.posix.join(path.posix.dirname(plik), m[2]));
      const ex = eksporty(zrodlo);
      for (const nazwa of m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
        if (!ex.has(nazwa)) problemy.push(plik + ': ' + nazwa + ' z ' + zrodlo);
      }
    }
  }
  assert.deepEqual(problemy, []);
});

test('każdy element, po który sięga interfejs, istnieje w swojej stronie', () => {
  // Taka rozbieżność wysypała 1.7.x: kod szukał elementu, którego HTML nie miał.
  const brak = new Set();
  for (const w of WEJSCIA) {
    const idHtml = new Set([...czytaj(w.html).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const plik of grafModulow(w.js)) {
      for (const m of czytaj(plik).matchAll(/\$\('([\w-]+)'\)/g)) {
        if (!idHtml.has(m[1])) brak.add(w.html + ' ← ' + plik + ': #' + m[1]);
      }
    }
  }
  assert.deepEqual([...brak], []);
});

test('numer wersji ma swój wpis na początku historii zmian', async () => {
  const { VERSION, CHANGELOG } = await import('../js/version.js');
  assert.equal(CHANGELOG[0].version, VERSION);
  const numery = CHANGELOG.map((e) => e.version);
  assert.equal(new Set(numery).size, numery.length, 'powtórzony numer wersji');
});

test('historia zmian idzie od najnowszej wersji', async () => {
  const { CHANGELOG } = await import('../js/version.js');
  const liczba = (v) => v.split('.').reduce((a, x) => a * 1000 + Number(x), 0);
  for (let i = 1; i < CHANGELOG.length; i++) {
    assert.ok(liczba(CHANGELOG[i - 1].version) > liczba(CHANGELOG[i].version),
      CHANGELOG[i - 1].version + ' przed ' + CHANGELOG[i].version);
  }
});
