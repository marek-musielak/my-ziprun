// Plan w linku: `…/my-ziprun/#plan=<dane>`.
//
// Dane siedzą po „#", bo ta część adresu nie wychodzi z przeglądarki — nie
// trafia na serwer GitHuba — a service worker obsłuży taki adres z pamięci
// offline jak zwykłe wejście do aplikacji.
//
// Grupy jadą w linku zwinięte, a nie rozwinięte: dwadzieścia powtórzeń to
// wtedy jeden wpis zamiast czterdziestu, więc link zostaje krótki bez kompresji.
//
// Na telefonie link jest jedynym wejściem danych z zewnątrz — mógł go ułożyć
// ktokolwiek. Odczyt sprawdza więc wszystko, a nazwy odcinków w ogóle nie są
// w nim przesyłane: telefon nadaje je sam, tymi samymi funkcjami co edytor.

import { NAZWA_RODZAJU, ZAKRES, rozwin } from './model.js';

export const PREFIKS = '#plan=';
const WERSJA = 1;

const doBase64Url = (tekst) => {
  const bajty = new TextEncoder().encode(tekst);
  let bin = '';
  for (const b of bajty) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const zBase64Url = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (z) => z.charCodeAt(0)));
};

const zwiez = (o) => [o.kind, o.t, o.v, o.i];

/** Plan z liczbami (wynik `przelicz`) → dane do linku. */
export function zakoduj(plan) {
  return doBase64Url(JSON.stringify({
    v: WERSJA,
    id: plan.id,
    n: plan.nazwa,
    e: plan.elementy.map((el) => (el.odcinki ? { r: el.r, e: el.odcinki.map(zwiez) } : zwiez(el))),
  }));
}

/** Pełny adres do wklejenia w komunikatorze. `baza` to adres aplikacji. */
export function adresPlanu(baza, plan) {
  return new URL(PREFIKS + zakoduj(plan), baza).href;
}

class ZlyLink extends Error {
  constructor(powod) { super('Link do planu jest uszkodzony: ' + powod + '.'); }
}

const calkowita = (x, od, doo) => Number.isInteger(x) && x >= od && x <= doo;

function odcinek(a) {
  if (!Array.isArray(a) || a.length !== 4) throw new ZlyLink('zły zapis odcinka');
  const [kind, t, v, i] = a;
  if (!Object.hasOwn(NAZWA_RODZAJU, kind)) throw new ZlyLink('nieznany rodzaj odcinka');
  if (!calkowita(t, ZAKRES.czasMin, ZAKRES.czasMax)) throw new ZlyLink('zły czas odcinka');
  // Prędkość co 0,1 km/h: dziesięciokrotność musi być (prawie) całkowita.
  const coDziesiata = typeof v === 'number' && Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;
  if (!coDziesiata || v < ZAKRES.predkoscMin || v > ZAKRES.predkoscMax) throw new ZlyLink('zła prędkość');
  if (!calkowita(i, ZAKRES.nachylenieMin, ZAKRES.nachylenieMax)) throw new ZlyLink('złe nachylenie');
  return { kind, t, v, i };
}

/**
 * Dane z linku → plan z liczbami, w tej samej postaci co `przelicz(...).plan`.
 * Rzuca błąd z opisem po polsku, gdy cokolwiek się nie zgadza.
 */
export function odkoduj(dane) {
  let obj;
  try { obj = JSON.parse(zBase64Url(String(dane))); }
  catch { throw new ZlyLink('nie da się go odczytać — sprawdź, czy skopiował się w całości'); }

  if (!obj || typeof obj !== 'object') throw new ZlyLink('brak danych');
  if (obj.v !== WERSJA) throw new ZlyLink('pochodzi z innej wersji aplikacji');
  if (typeof obj.id !== 'string' || !/^edytor-[a-z0-9-]{1,40}$/.test(obj.id)) throw new ZlyLink('zły identyfikator planu');

  // Znaki sterujące wycinamy — nazwa trafia na ekran i do historii treningów.
  const nazwa = typeof obj.n === 'string' ? obj.n.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  if (!nazwa || nazwa.length > ZAKRES.nazwaMax) throw new ZlyLink('zła nazwa planu');

  if (!Array.isArray(obj.e) || !obj.e.length || obj.e.length > ZAKRES.elementowMax) throw new ZlyLink('zła lista odcinków');
  const elementy = obj.e.map((el) => {
    if (Array.isArray(el)) return odcinek(el);
    if (!el || typeof el !== 'object' || !calkowita(el.r, ZAKRES.powtorzeniaMin, ZAKRES.powtorzeniaMax)) {
      throw new ZlyLink('zła grupa');
    }
    if (!Array.isArray(el.e) || !el.e.length || el.e.length > ZAKRES.odcinkowWGrupieMax) throw new ZlyLink('zła grupa');
    // Grup w grupach nie ma — odcinek(…) odrzuci wszystko, co nie jest odcinkiem.
    return { r: el.r, odcinki: el.e.map(odcinek) };
  });

  const r = rozwin(elementy);
  if (r.length > ZAKRES.odcinkowPoRozwinieciuMax) throw new ZlyLink('za dużo odcinków');
  if (r.reduce((a, o) => a + o.t, 0) > ZAKRES.calyPlanMaxS) throw new ZlyLink('plan trwa za długo');

  return { id: obj.id, nazwa, elementy };
}
