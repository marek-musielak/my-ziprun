// Edytor planów na komputerze. Układasz odcinki, „Generuj" kopiuje link,
// a link otwarty na telefonie dodaje plan do aplikacji.
//
// Tu jest tylko ekran — odczyt pól, grupy, walidacja i podsumowanie siedzą
// w model.js, a zapis planu w linku w link.js.

import { VERSION } from '../version.js';
import { fmtTime } from '../plans.js';
import { esc, plural } from '../tekst.js';
import { chartHtml } from '../ui/charts.js';
import * as m from './model.js';
import { adresPlanu } from './link.js';

const $ = (id) => document.getElementById(id);
const els = (sel) => [...document.querySelectorAll(sel)];

// Edytor pamięta tylko ostatni plan: przy każdej zmianie zapis w przeglądarce,
// więc zamknięta karta niczego nie gubi, a poprawiony plan ma ten sam
// identyfikator i na telefonie nadpisze poprzednią wersję.
const KLUCZ = 'ziprun.edytor';

let plan = wczytaj();
// Zaznaczenie do grupowania to stan ekranu, nie planu — nie zapisujemy go.
const zaznaczone = new Set();

function wczytaj() {
  try {
    const p = JSON.parse(localStorage.getItem(KLUCZ) || 'null');
    if (p && typeof p.id === 'string' && typeof p.nazwa === 'string' && Array.isArray(p.elementy)) return p;
  } catch { /* uszkodzony zapis — zaczynamy od nowa */ }
  return m.nowyPlan();
}

function zapisz() {
  try { localStorage.setItem(KLUCZ, JSON.stringify(plan)); }
  catch { /* pełna pamięć: edytor działa dalej, tylko bez zapisu */ }
  // Każda zmiana unieważnia wygenerowany link — inaczej łatwo wkleić
  // na telefon starą wersję, myśląc, że to ta poprawiona.
  $('ed-link').classList.add('hidden');
  status('');
}

/** Zmiana struktury listy: nowy plan i pełne przerysowanie. */
function zmien(nowy, { zachowajZaznaczenie = false } = {}) {
  plan = nowy;
  if (!zachowajZaznaczenie) zaznaczone.clear();
  zapisz();
  rysujListe();
  odswiez();
}

function status(tekst, blad = false) {
  const s = $('ed-status');
  s.textContent = tekst;
  s.classList.toggle('ed-blad', blad);
}

// --------------------------------------------------------------- lista

const pole = (nazwa, wartosc, jednostka, tryb, podpowiedz = '') =>
  '<label class="ed-pole ed-' + nazwa + '">' +
  '<input class="input" data-pole="' + nazwa + '" value="' + esc(wartosc) + '" inputmode="' + tryb + '" autocomplete="off"' +
    (podpowiedz ? ' placeholder="' + podpowiedz + '"' : '') + '>' +
  '<span class="ed-jedn">' + jednostka + '</span></label>';

function wiersz(o, sciezka) {
  const wGrupie = sciezka.length > 1;
  return '<div class="ed-odc ' + esc(o.kind) + '" data-s="' + sciezka.join('.') + '">' +
    // Grupować można tylko odcinki spoza grup, więc w grupie nie ma pola wyboru.
    (wGrupie ? '<span class="ed-zazn"></span>'
      : '<input type="checkbox" class="ed-zazn" aria-label="Zaznacz do grupy"' +
        (zaznaczone.has(sciezka[0]) ? ' checked' : '') + '>') +
    '<button class="ed-rodzaj" data-akcja="rodzaj" title="Kliknij, żeby zmienić rodzaj">' +
      esc(m.NAZWA_RODZAJU[o.kind] || o.kind) + '</button>' +
    pole('t', o.t, '', 'text') +
    pole('v', o.v, 'km/h', 'decimal') +
    // Puste nachylenie liczy się jako 0 % — podpowiedź to pokazuje.
    pole('i', o.i, '%', 'numeric', '0') +
    '<button class="ed-ikona ed-dup" data-akcja="duplikuj">Duplikuj</button>' +
    '<button class="ed-ikona" data-akcja="usun">Usuń</button>' +
    '</div>';
}

function rysujListe() {
  $('ed-lista').innerHTML = plan.elementy.map((el, gi) => {
    if (!Array.isArray(el.odcinki)) return wiersz(el, [gi]);
    return '<div class="ed-grupa" data-g="' + gi + '">' +
      '<div class="ed-grupa-nag" data-s="' + gi + '">' +
        '<span>Grupa ×</span>' +
        '<input class="input" data-pole="r" value="' + esc(el.r) + '" inputmode="numeric" aria-label="Liczba powtórzeń">' +
        '<span class="ed-grupa-opis"></span>' +
        '<button class="ed-ikona" data-akcja="rozgrupuj">Rozgrupuj</button>' +
      '</div>' +
      el.odcinki.map((o, si) => wiersz(o, [gi, si])).join('') +
      '</div>';
  }).join('');
}

const sciezka = (el) => el.closest('[data-s]').dataset.s.split('.').map(Number);

$('ed-lista').addEventListener('click', (e) => {
  const b = e.target.closest('[data-akcja]');
  if (!b) return;
  const akcja = b.dataset.akcja;
  if (akcja === 'rozgrupuj') return zmien(m.rozgrupuj(plan, Number(b.closest('.ed-grupa').dataset.g)));
  const s = sciezka(b);
  // Zmiana rodzaju nie przesuwa odcinków, więc zaznaczenie może zostać.
  if (akcja === 'rodzaj') return zmien(m.przelaczRodzaj(plan, s), { zachowajZaznaczenie: true });
  if (akcja === 'duplikuj') return zmien(m.duplikuj(plan, s));
  if (akcja === 'usun') return zmien(m.usun(plan, s));
});

$('ed-lista').addEventListener('change', (e) => {
  if (!e.target.classList.contains('ed-zazn')) return;
  const [gi] = sciezka(e.target);
  if (e.target.checked) zaznaczone.add(gi); else zaznaczone.delete(gi);
  odswiez();
});

// Pisanie w polu nie przerysowuje listy — kursor zostaje tam, gdzie był.
$('ed-lista').addEventListener('input', (e) => {
  const nazwa = e.target.dataset.pole;
  if (!nazwa) return;
  plan = m.ustaw(plan, sciezka(e.target), nazwa, e.target.value);
  zapisz();
  odswiez();
});

$('ed-dodaj').addEventListener('click', () => {
  zmien(m.dodajOdcinek(plan));
  // Nowy odcinek ląduje na dole — pokazujemy go i od razu dajemy pisać czas.
  els('#ed-lista [data-pole="t"]').at(-1)?.focus();
});

$('ed-grupuj').addEventListener('click', () => zmien(m.grupuj(plan, [...zaznaczone])));

$('ed-nazwa').addEventListener('input', (e) => {
  plan = { ...plan, nazwa: e.target.value };
  zapisz();
  odswiez();
});

$('ed-nowy').addEventListener('click', () => {
  if (!confirm('Zacząć nowy plan?\n\nObecny zniknie z edytora. Na telefonie, jeśli już go dodałeś, zostaje.')) return;
  zmien(m.nowyPlan());
  $('ed-nazwa').value = plan.nazwa;
});

// ------------------------------------------------------------- wynik

/** Podświetlenia, przeliczenia i podsumowanie — bez ruszania pól. */
function odswiez() {
  const w = m.przelicz(plan);

  for (const inp of els('#ed-lista [data-pole]')) {
    const blad = w.bledy[inp.closest('[data-s]').dataset.s + '.' + inp.dataset.pole];
    inp.classList.toggle('zle', !!blad);
    inp.title = blad || '';
  }
  for (const pl of els('#ed-lista .ed-t')) {
    const t = m.parsujCzas(pl.querySelector('input').value);
    pl.querySelector('.ed-jedn').textContent = t === null ? '' : m.opisCzasu(t);
  }
  for (const nag of els('#ed-lista .ed-grupa-nag')) {
    const g = w.plan.elementy[Number(nag.dataset.s)];
    const ok = g.r !== null && g.odcinki.every((o) => o.t !== null);
    nag.querySelector('.ed-grupa-opis').textContent = ok
      ? '= ' + g.r * g.odcinki.length + ' ' + plural(g.r * g.odcinki.length, 'odcinek', 'odcinki', 'odcinków') +
        ', ' + fmtTime(g.r * g.odcinki.reduce((a, o) => a + o.t, 0))
      : '';
  }

  $('ed-nazwa').classList.toggle('zle', !!w.bledy.nazwa);
  $('ed-grupuj').disabled = !m.moznaGrupowac(plan, [...zaznaczone]);
  $('ed-generuj').disabled = !w.ok;

  const ogolne = [w.bledy.nazwa, w.bledy.plan].filter(Boolean);
  const wPolach = Object.keys(w.bledy).some((k) => k !== 'nazwa' && k !== 'plan');
  if (wPolach) ogolne.push('Popraw pola zaznaczone na czerwono — najedź na pole, żeby zobaczyć, co jest nie tak.');
  $('ed-bledy').textContent = ogolne.join(' ');
  $('ed-bledy').classList.toggle('hidden', !ogolne.length);

  $('ed-chart').classList.toggle('hidden', !w.ok);
  if (!w.ok) {
    $('ed-meta').innerHTML = '<span>Podsumowanie pojawi się, gdy wszystkie pola będą poprawne</span>';
    $('ed-chart').innerHTML = '';
    $('ed-linie').textContent = '';
    return;
  }

  const odcinki = m.nazwij(m.rozwin(w.plan.elementy));
  const s = m.podsumowanie(odcinki);
  $('ed-meta').innerHTML = [
    fmtTime(s.czasS),
    '~' + s.dystansKm.toFixed(2).replace('.', ',') + ' km',
    s.odcinkow + ' ' + plural(s.odcinkow, 'odcinek', 'odcinki', 'odcinków'),
    '↑ ' + Math.round(s.przewyzszenieM) + ' m',
  ].map((x) => '<span>' + x + '</span>').join('');
  $('ed-chart').innerHTML = chartHtml(
    odcinki.map((o) => ({ kind: o.kind, label: o.label, speed: o.v, duration: o.t })),
    Math.max(...odcinki.map((o) => o.v), 1),
  );
  $('ed-linie').textContent = odcinki.map(m.liniaOdcinka).join('\n');
}

// ------------------------------------------------------------ generuj

$('ed-generuj').addEventListener('click', async () => {
  const w = m.przelicz(plan);
  if (!w.ok) return;
  // Link prowadzi do aplikacji, a nie do edytora — to ją otwierasz na telefonie.
  const adres = adresPlanu(new URL('./', location.href).href, w.plan);
  const pl = $('ed-link');
  pl.value = adres;
  pl.classList.remove('hidden');
  try {
    await navigator.clipboard.writeText(adres);
    status('Skopiowano — wklej w komunikatorze i otwórz w Chrome na telefonie.');
  } catch {
    pl.select();
    status('Nie udało się skopiować — zaznacz link poniżej i skopiuj go ręcznie.', true);
  }
});

$('ed-link').addEventListener('focus', (e) => e.target.select());

// ---------------------------------------------------------------- start

$('brand-ver').textContent = VERSION;
$('ed-nazwa').value = plan.nazwa;
rysujListe();
odswiez();

// Rejestracja także stąd: bez niej komputer, na którym otwierasz tylko
// edytor, nigdy nie dostałby nowej wersji z pamięci offline.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('sw.js?v=' + VERSION, { type: 'module', updateViaCache: 'none' })
    .catch(() => { /* offline opcjonalny */ });
}
