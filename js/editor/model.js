// Model edytora planów: odcinki, grupy, walidacja, podsumowanie.
//
// Czyste funkcje bez DOM. Używa ich edytor na komputerze i import linku na
// telefonie — dzięki temu plan rozwija się i nazywa w obu miejscach tak samo.
//
// Edytor trzyma pola dokładnie tak, jak je wpisano (tekst), żeby błędna
// wartość została na ekranie podświetlona, a nie po cichu poprawiona.
// Liczby powstają dopiero w `przelicz`.

import { nachylenieTerenu, przewyzszenie } from '../plans.js';

/**
 * Kolejność rodzajów pod przyciskiem: każde kliknięcie przechodzi dalej.
 * Sprint zaraz po pracy — to z niej najczęściej się go robi.
 */
export const CYKL_RODZAJOW = ['work', 'sprint', 'recovery', 'cooldown', 'warmup'];

export const NAZWA_RODZAJU = {
  work: 'Praca',
  sprint: 'Sprint',
  recovery: 'Przerwa',
  cooldown: 'Schłodzenie',
  warmup: 'Rozgrzewka',
};

// Prędkość i nachylenie to zakres bieżni FS-CA455B. Krótszego odcinka niż
// dziesięć sekund pas nie zdąży zmienić, a głos zapowiedzieć. Górne granice
// czasu i liczby odcinków są tylko zabezpieczeniem przed linkiem, który
// zawiesiłby telefon — żaden prawdziwy trening do nich nie dochodzi.
export const ZAKRES = {
  predkoscMin: 1,
  predkoscMax: 22,
  nachylenieMin: 0,
  nachylenieMax: 20,
  czasMin: 10,
  czasMax: 6 * 3600,
  powtorzeniaMin: 1,
  powtorzeniaMax: 50,
  nazwaMax: 60,
  elementowMax: 200,
  odcinkowWGrupieMax: 50,
  odcinkowPoRozwinieciuMax: 1000,
  calyPlanMaxS: 24 * 3600,
};

/** Pierwszy odcinek nowego planu. */
export const PIERWSZY_ODCINEK = { kind: 'warmup', v: '9', i: '0', t: '30:00' };

export const nastepnyRodzaj = (kind) =>
  CYKL_RODZAJOW[(CYKL_RODZAJOW.indexOf(kind) + 1) % CYKL_RODZAJOW.length];

const MIESIACE = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const dwa = (n) => String(n).padStart(2, '0');

/** „Plan 29 wrz 2026 21:05" — domyślna nazwa, do zmiany w polu. */
export const domyslnaNazwa = (d = new Date()) =>
  'Plan ' + dwa(d.getDate()) + ' ' + MIESIACE[d.getMonth()] + ' ' + d.getFullYear() +
  ' ' + dwa(d.getHours()) + ':' + dwa(d.getMinutes());

let licznik = 0;
export const nowyId = () => 'edytor-' + Date.now().toString(36) + '-' +
  (licznik++).toString(36) + Math.floor(Math.random() * 46656).toString(36);

export const nowyPlan = (teraz = new Date()) => ({
  id: nowyId(),
  nazwa: domyslnaNazwa(teraz),
  elementy: [{ ...PIERWSZY_ODCINEK }],
});

// ------------------------------------------------------------ odczyt pól

/** Prędkość w km/h, co 0,1. Przecinek i kropka są równoważne. */
export function parsujPredkosc(txt) {
  const s = String(txt ?? '').trim().replace(',', '.');
  if (!/^\d{1,2}(\.\d)?$/.test(s)) return null;
  const v = Number(s);
  return v >= ZAKRES.predkoscMin && v <= ZAKRES.predkoscMax ? v : null;
}

/**
 * Nachylenie bieżni w pełnych procentach. Puste pole to 0 % — bieg po
 * płaskim jest najczęstszy i nie trzeba wpisywać zera w każdym odcinku.
 */
export function parsujNachylenie(txt) {
  const s = String(txt ?? '').trim();
  if (s === '') return 0;
  if (!/^\d{1,2}$/.test(s)) return null;
  const i = Number(s);
  return i >= ZAKRES.nachylenieMin && i <= ZAKRES.nachylenieMax ? i : null;
}

/**
 * Czas odcinka. Z dwukropkiem to minuty i sekundy („1:30" = 90 s),
 * bez niego same sekundy („90").
 */
export function parsujCzas(txt) {
  const s = String(txt ?? '').trim();
  let t;
  if (s.includes(':')) {
    const m = /^(\d{1,3}):(\d{1,2})$/.exec(s);
    if (!m || Number(m[2]) > 59) return null;
    t = Number(m[1]) * 60 + Number(m[2]);
  } else {
    if (!/^\d{1,5}$/.test(s)) return null;
    t = Number(s);
  }
  return t >= ZAKRES.czasMin && t <= ZAKRES.czasMax ? t : null;
}

export function parsujPowtorzenia(txt) {
  const s = String(txt ?? '').trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  const r = Number(s);
  return r >= ZAKRES.powtorzeniaMin && r <= ZAKRES.powtorzeniaMax ? r : null;
}

// ------------------------------------------------------ operacje edytora
//
// Ścieżka odcinka to [indeks] na najwyższym poziomie albo [grupa, odcinek]
// w środku grupy. Każda operacja zwraca nowy plan i nie zmienia starego.

const kopia = (plan) => JSON.parse(JSON.stringify(plan));
const jestGrupa = (el) => Array.isArray(el?.odcinki);

function odcinekPod(plan, [gi, si]) {
  const el = plan.elementy[gi];
  return si === undefined ? el : el?.odcinki?.[si];
}

/** Nowy odcinek przepisuje wartości z ostatniego odcinka planu, rodzaj: praca. */
export function dodajOdcinek(plan) {
  const p = kopia(plan);
  const ost = p.elementy.at(-1);
  const wzor = jestGrupa(ost) ? ost.odcinki.at(-1) : ost;
  p.elementy.push(wzor ? { kind: 'work', v: wzor.v, i: wzor.i, t: wzor.t } : { ...PIERWSZY_ODCINEK });
  return p;
}

/** Wstawia kopię odcinka tuż pod nim — w tej samej grupie, jeśli w niej jest. */
export function duplikuj(plan, sciezka) {
  const p = kopia(plan);
  const [gi, si] = sciezka;
  if (si === undefined) p.elementy.splice(gi + 1, 0, { ...p.elementy[gi] });
  else p.elementy[gi].odcinki.splice(si + 1, 0, { ...p.elementy[gi].odcinki[si] });
  return p;
}

/** Usuwa odcinek. Grupa, z której zniknął ostatni odcinek, znika razem z nim. */
export function usun(plan, sciezka) {
  const p = kopia(plan);
  const [gi, si] = sciezka;
  if (si === undefined) p.elementy.splice(gi, 1);
  else {
    p.elementy[gi].odcinki.splice(si, 1);
    if (!p.elementy[gi].odcinki.length) p.elementy.splice(gi, 1);
  }
  return p;
}

export function przelaczRodzaj(plan, sciezka) {
  const p = kopia(plan);
  const o = odcinekPod(p, sciezka);
  o.kind = nastepnyRodzaj(o.kind);
  return p;
}

/** Zmienia jedno pole odcinka (v, i, t) albo liczbę powtórzeń grupy (r). */
export function ustaw(plan, sciezka, pole, wartosc) {
  const p = kopia(plan);
  const cel = pole === 'r' ? p.elementy[sciezka[0]] : odcinekPod(p, sciezka);
  cel[pole] = String(wartosc);
  return p;
}

/**
 * Grupować można co najmniej dwa sąsiednie odcinki leżące poza grupami —
 * przy rozrzuconych nie wiadomo, gdzie grupa miałaby trafić.
 */
export function moznaGrupowac(plan, indeksy) {
  if (indeksy.length < 2) return false;
  const pos = [...indeksy].sort((a, b) => a - b);
  for (let k = 0; k < pos.length; k++) {
    if (k > 0 && pos[k] !== pos[k - 1] + 1) return false;
    const el = plan.elementy[pos[k]];
    if (!el || jestGrupa(el)) return false;
  }
  return true;
}

/**
 * Łączy odcinki w grupę w miejscu, w którym były. Na start jedno powtórzenie,
 * więc samo grupowanie niczego w planie nie zmienia — dopiero liczba powtórzeń.
 */
export function grupuj(plan, indeksy) {
  if (!moznaGrupowac(plan, indeksy)) return plan;
  const p = kopia(plan);
  const pos = [...indeksy].sort((a, b) => a - b);
  const odcinki = p.elementy.splice(pos[0], pos.length);
  p.elementy.splice(pos[0], 0, { r: '1', odcinki });
  return p;
}

/** Zamienia grupę z powrotem w zwykłe odcinki, w jednym egzemplarzu. */
export function rozgrupuj(plan, gi) {
  const p = kopia(plan);
  if (!jestGrupa(p.elementy[gi])) return p;
  p.elementy.splice(gi, 1, ...p.elementy[gi].odcinki);
  return p;
}

// ------------------------------------------------------ walidacja i liczby

/**
 * Zamienia pola na liczby i zbiera błędy. Klucz błędu to ścieżka i pole,
 * np. „2.1.t" — edytor podświetla po nim dokładnie to jedno pole.
 */
export function przelicz(plan) {
  const bledy = {};
  const liczby = (o, klucz) => {
    const v = parsujPredkosc(o.v), i = parsujNachylenie(o.i), t = parsujCzas(o.t);
    if (v === null) bledy[klucz + '.v'] = 'Prędkość ' + ZAKRES.predkoscMin + '–' + ZAKRES.predkoscMax + ' km/h, co 0,1';
    if (i === null) bledy[klucz + '.i'] = 'Nachylenie ' + ZAKRES.nachylenieMin + '–' + ZAKRES.nachylenieMax + ' %';
    if (t === null) bledy[klucz + '.t'] = 'Czas co najmniej ' + ZAKRES.czasMin + ' s, np. 90 albo 1:30';
    if (!NAZWA_RODZAJU[o.kind]) bledy[klucz + '.kind'] = 'Nieznany rodzaj odcinka';
    return { kind: o.kind, v, i, t };
  };

  const elementy = (plan.elementy || []).map((el, gi) => {
    if (!jestGrupa(el)) return liczby(el, String(gi));
    const r = parsujPowtorzenia(el.r);
    if (r === null) bledy[gi + '.r'] = 'Powtórzenia ' + ZAKRES.powtorzeniaMin + '–' + ZAKRES.powtorzeniaMax;
    return { r, odcinki: el.odcinki.map((o, si) => liczby(o, gi + '.' + si)) };
  });

  const nazwa = String(plan.nazwa ?? '').trim();
  if (!nazwa) bledy.nazwa = 'Podaj nazwę planu';
  else if (nazwa.length > ZAKRES.nazwaMax) bledy.nazwa = 'Nazwa może mieć najwyżej ' + ZAKRES.nazwaMax + ' znaków';

  if (!elementy.length) bledy.plan = 'Plan nie ma żadnego odcinka';
  else if (elementy.length > ZAKRES.elementowMax) bledy.plan = 'Za dużo odcinków';

  const wynik = { id: plan.id, nazwa, elementy };
  if (!Object.keys(bledy).length) {
    const r = rozwin(elementy);
    if (r.length > ZAKRES.odcinkowPoRozwinieciuMax) {
      bledy.plan = 'Po rozwinięciu grup plan ma ' + r.length + ' odcinków — najwyżej ' + ZAKRES.odcinkowPoRozwinieciuMax;
    } else if (r.reduce((a, o) => a + o.t, 0) > ZAKRES.calyPlanMaxS) {
      bledy.plan = 'Plan trwa dłużej niż ' + ZAKRES.calyPlanMaxS / 3600 + ' godziny';
    }
  }
  return { bledy, plan: wynik, ok: !Object.keys(bledy).length };
}

/** Rozwija grupy w płaską listę odcinków, w kolejności biegu. */
export function rozwin(elementy) {
  const out = [];
  for (const el of elementy) {
    if (!jestGrupa(el)) { out.push(el); continue; }
    for (let k = 0; k < el.r; k++) for (const o of el.odcinki) out.push(o);
  }
  return out;
}

/**
 * Nazwy odcinków: praca i sprint numerowane po kolei, każde osobno — „Praca 3"
 * to trzecia praca, a nie trzeci wysiłek dowolnego rodzaju. Reszta nazwą rodzaju.
 */
export function nazwij(odcinki) {
  const licznik = { work: 0, sprint: 0 };
  return odcinki.map((o) => ({
    ...o,
    label: o.kind in licznik ? NAZWA_RODZAJU[o.kind] + ' ' + ++licznik[o.kind] : NAZWA_RODZAJU[o.kind],
  }));
}

/**
 * Plan w postaci, którą rozumie aplikacja na telefonie. Prędkości wpisane
 * liczbą, więc plan nie skaluje się z profilem — biegniesz dokładnie to,
 * co ułożyłeś.
 */
export function doPlanu(liczbowy) {
  return {
    id: liczbowy.id,
    name: liczbowy.nazwa,
    focus: 'Z edytora',
    desc: '',
    custom: true,
    zEdytora: true,
    segments: nazwij(rozwin(liczbowy.elementy)).map((o) => ({
      t: o.t, s: o.v, i: o.i, kind: o.kind, label: o.label,
    })),
  };
}

// ------------------------------------------------------------ podsumowanie

export function podsumowanie(odcinki) {
  let czasS = 0, dystansKm = 0, przewyzszenieM = 0;
  for (const o of odcinki) {
    const km = (o.v * o.t) / 3600;
    czasS += o.t;
    dystansKm += km;
    przewyzszenieM += przewyzszenie(km * 1000, o.i);
  }
  return { czasS, dystansKm, przewyzszenieM, odcinkow: odcinki.length };
}

/** Tempo na kilometr: 9 km/h to „6:40". */
export function tempo(kmh) {
  const s = Math.round(3600 / kmh);
  return Math.floor(s / 60) + ':' + dwa(s % 60);
}

const liczbaPL = (x) => String(Math.round(x * 100) / 100).replace('.', ',');

/** Jedna linia listy odcinków: „04m30s [6:40] /2,5%". */
export const liniaOdcinka = (o) =>
  dwa(Math.floor(o.t / 60)) + 'm' + dwa(o.t % 60) + 's' +
  ' [' + tempo(o.v) + '] /' + liczbaPL(nachylenieTerenu(o.i)) + '%';

/** Przeliczenie pokazywane obok pola czasu: „1 min 30 s". */
export function opisCzasu(t) {
  if (t < 60) return t + ' s';
  const m = Math.floor(t / 60), s = t % 60;
  return m + ' min' + (s ? ' ' + s + ' s' : '');
}
