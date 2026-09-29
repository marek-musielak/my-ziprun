// Generator własnych planów treningowych.
//
// Plan powstaje z trzech decyzji: ile czasu masz, jaki to ma być trening
// i jak mocno. Reszta - długość rozgrzewki, liczba serii, długości odcinków -
// wynika z tych trzech, bo to są rzeczy, które da się policzyć, a nie takie,
// o które warto pytać.
//
// Prędkości zapisujemy jako kotwice wysiłku ('easy', 'tempo', ...), tak samo
// jak plany wbudowane. Dzięki temu wygenerowany plan skaluje się razem
// z profilem i nie trzeba go przepisywać po zmianie formy.

export const TYPY = [
  {
    id: 'fat',
    nazwa: 'Spalanie tłuszczu',
    focus: 'Redukcja / baza tlenowa',
    opis: 'Długi wysiłek w strefie tlenowej z delikatnie falującą prędkością. ' +
      'Zmiany są na tyle małe, że tętno zostaje w strefie, a na tyle wyraźne, żeby nie zasnąć z nudów.',
  },
  {
    id: 'interwaly',
    nazwa: 'Interwały',
    focus: 'Interwały / moc',
    opis: 'Serie mocnego biegu przedzielone truchtem. Krótko, intensywnie i z wyraźnym rytmem.',
  },
  {
    id: 'wytrzymalosc',
    nazwa: 'Wytrzymałość',
    focus: 'Wytrzymałość tempowa',
    opis: 'Jeden ciągły blok w równym tempie. Bez zmian prędkości — liczy się utrzymanie rytmu do końca.',
  },
  {
    id: 'narastajacy',
    nazwa: 'Narastający',
    focus: 'Kontrola tempa',
    opis: 'Prędkość rośnie od truchtu do docelowego tempa. Najtrudniejsze jest na końcu, kiedy jesteś już zmęczony.',
  },
  {
    id: 'marsz',
    nazwa: 'Marsz i regeneracja',
    focus: 'Odnowa',
    opis: 'Spokojny marsz na dzień po mocnym treningu albo na rozruch po przerwie.',
  },
];

export const INTENSYWNOSCI = [
  { id: 'lagodna', nazwa: 'Łagodna', level: 1 },
  { id: 'srednia', nazwa: 'Średnia', level: 2 },
  { id: 'mocna', nazwa: 'Mocna', level: 3 },
];

export const MIN_MINUT = 10;
export const MAX_MINUT = 90;

/**
 * Dzieli czas na n kawałków tak, żeby suma wyszła co do sekundy. Nadmiar
 * rozkłada się po kawałkach zamiast lądować w całości na ostatnim — inaczej
 * przy dziesięciu seriach ostatnia byłaby o półtorej minuty dłuższa.
 */
export function rozdziel(czas, n) {
  const ile = Math.max(1, Math.min(n, czas));
  // Okrągłe dziesiątki czytają się lepiej, ale tylko dopóki kawałek jest na
  // tyle długi, żeby siatka co dziesięć sekund go nie wyzerowała.
  const krok = czas / ile >= 20 ? 10 : 1;
  const podstawa = Math.floor(czas / ile / krok) * krok;
  const reszta = czas - podstawa * ile;
  const zDodatkiem = Math.floor(reszta / krok);
  const ogon = reszta - zDodatkiem * krok;
  return Array.from({ length: ile }, (_, i) =>
    podstawa + (i < zDodatkiem ? krok : 0) + (i === ile - 1 ? ogon : 0));
}

/**
 * Rozgrzewka i schłodzenie rosną wraz z długością treningu, ale nigdy nie
 * zjadają części właściwej. Przy bardzo krótkim treningu ustępują jej miejsca.
 */
function ramy(calosc) {
  const zaokr = (s) => Math.round(s / 30) * 30;
  let wu = Math.min(360, Math.max(120, zaokr(calosc * 0.18)));
  let cd = Math.min(300, Math.max(120, zaokr(calosc * 0.14)));
  if (calosc - wu - cd < 180) {
    wu = zaokr(calosc * 0.28);
    cd = zaokr(calosc * 0.22);
  }
  return { wu, cd, rdzen: calosc - wu - cd };
}

// Licznik w identyfikatorze. Sam znacznik czasu nie wystarcza: dwa plany
// utworzone w tej samej milisekundzie dostawały ten sam numer, a wtedy jeden
// z nich przestawał być odnajdywalny.
let licznik = 0;
const nowyId = () => 'wlasny-' + Date.now().toString(36) + '-' + (licznik++).toString(36) +
  Math.floor(Math.random() * 46656).toString(36);

// Drabinka wysiłku od truchtu w górę — używana przez plan narastający.
const DRABINKA = ['jog', 'easy', 'steady', 'tempo', 'threshold', 'vo2'];

// Pełna drabinka, od najwolniejszego. Służy do dobrania rozgrzewki
// i schłodzenia poniżej najlżejszego odcinka właściwego treningu.
const PELNA_DRABINKA = ['stroll', 'walk', 'brisk', 'jog', 'easy', 'steady', 'tempo', 'threshold', 'vo2'];

/**
 * Kotwica ram treningu. Marsz zaczyna się od marszu, więc rozgrzewka „walk"
 * miała dokładnie to samo tempo co trening — sześć minut rozgrzewki biegło
 * w tempie, w którym potem szedł cały trening. Bierzemy więc szczebel niżej
 * niż najlżejszy odcinek rdzenia, ale nigdy wyżej niż marsz: przed biegiem
 * rozgrzewką ma zostać marsz, a nie trucht.
 */
export function kotwicaRam(srodek) {
  const najlzejszy = srodek
    .map((s) => PELNA_DRABINKA.indexOf(s.s))
    .filter((i) => i >= 0)
    .reduce((a, b) => Math.min(a, b), PELNA_DRABINKA.length - 1);
  const nizej = PELNA_DRABINKA[Math.max(0, najlzejszy - 1)];
  const domyslna = PELNA_DRABINKA.indexOf('walk');
  return PELNA_DRABINKA.indexOf(nizej) < domyslna ? nizej : 'walk';
}

const USTAWIENIA = {
  fat: {
    lagodna: { baza: 'jog', fala: 'easy' },
    srednia: { baza: 'easy', fala: 'steady' },
    mocna: { baza: 'easy', fala: 'tempo' },
  },
  interwaly: {
    lagodna: { praca: 'steady', przerwa: 'jog', pracaS: 60, przerwaS: 90 },
    srednia: { praca: 'tempo', przerwa: 'jog', pracaS: 60, przerwaS: 60 },
    mocna: { praca: 'vo2', przerwa: 'jog', pracaS: 45, przerwaS: 75 },
  },
  wytrzymalosc: {
    lagodna: { tempo: 'easy' },
    srednia: { tempo: 'steady' },
    mocna: { tempo: 'tempo' },
  },
  narastajacy: {
    lagodna: { szczyt: 'easy' },
    srednia: { szczyt: 'tempo' },
    mocna: { szczyt: 'vo2' },
  },
  marsz: {
    lagodna: { baza: 'walk', fala: 'walk' },
    srednia: { baza: 'walk', fala: 'brisk' },
    mocna: { baza: 'brisk', fala: 'jog' },
  },
};

/**
 * Falujące bloki: baza, fala, baza, fala... Blok trwa około czterech minut.
 *
 * Oba rodzaje bloków to praca. "recovery" w tej aplikacji znaczy przerwę
 * między wysiłkami, a nie wolniejsze z dwóch temp biegu — przy złym rodzaju
 * ekran treningu pisał „Przerwa" w trakcie czterominutowego biegu na ósemce.
 */
function rdzenFalujacy(rdzen, { baza, fala }, etykiety) {
  const n = Math.max(2, Math.round(rdzen / 240));
  return rozdziel(rdzen, n).map((t, i) => ({
    t,
    s: i % 2 === 0 ? baza : fala,
    kind: 'work',
    label: i % 2 === 0 ? etykiety.baza : etykiety.fala,
  }));
}

/**
 * Serie pracy o stałej długości, przerwy dobrane tak, żeby rdzeń wypełnił się
 * dokładnie. Liczbę serii dobieramy tak, aby przerwa nie zeszła poniżej
 * trzydziestu sekund — krótsza nie jest już przerwą.
 */
function rdzenInterwalowy(rdzen, u) {
  const cykl = u.pracaS + u.przerwaS;
  let n = Math.min(20, Math.max(2, Math.round(rdzen / cykl)));
  while (n > 2 && (rdzen - n * u.pracaS) / n < 30) n--;
  const przerwy = rozdziel(rdzen - n * u.pracaS, n);
  const segmenty = [];
  for (let i = 0; i < n; i++) {
    segmenty.push({
      t: u.pracaS, s: u.praca, kind: 'work',
      label: 'Seria ' + (i + 1) + ' z ' + n,
      cue: i === 0 ? 'Mocno, ale kontrolowanie' : undefined,
    });
    segmenty.push({ t: przerwy[i], s: u.przerwa, kind: 'recovery', label: 'Trucht' });
  }
  return segmenty;
}

/** Prędkość rośnie po drabince wysiłku aż do szczytu na ostatnim bloku. */
function rdzenNarastajacy(rdzen, { szczyt }) {
  const doSzczytu = DRABINKA.indexOf(szczyt);
  const n = Math.max(3, Math.min(doSzczytu + 1, Math.round(rdzen / 300)));
  const kroki = Array.from({ length: n }, (_, i) =>
    DRABINKA[Math.round((i / (n - 1)) * doSzczytu)]);
  return rozdziel(rdzen, n).map((t, i) => ({
    t,
    s: kroki[i],
    // Pierwszy stopień jest najwolniejszy, ale to nadal stopień, a nie przerwa.
    kind: 'work',
    label: 'Stopień ' + (i + 1) + ' z ' + n,
    cue: i === n - 1 ? 'Ostatni stopień — dowieź do końca' : undefined,
  }));
}

function rdzenCiagly(rdzen, kotwica, label, cue) {
  return [{ t: rdzen, s: kotwica, kind: 'work', label, cue }];
}

/**
 * Buduje plan z trzech parametrów. Suma odcinków jest zawsze dokładnie równa
 * zamówionemu czasowi — plan „na 40 minut" ma trwać czterdzieści minut.
 */
export function generujPlan({ typ, minuty, intensywnosc, nazwa } = {}) {
  const opisTypu = TYPY.find((t) => t.id === typ);
  if (!opisTypu) throw new Error('Nieznany typ treningu: ' + typ);
  const opisInt = INTENSYWNOSCI.find((i) => i.id === intensywnosc);
  if (!opisInt) throw new Error('Nieznana intensywność: ' + intensywnosc);
  const min = Math.round(Math.min(MAX_MINUT, Math.max(MIN_MINUT, minuty || 30)));

  const calosc = min * 60;
  const { wu, cd, rdzen } = ramy(calosc);
  const u = USTAWIENIA[typ][intensywnosc];

  let srodek;
  if (typ === 'fat') srodek = rdzenFalujacy(rdzen, u, { baza: 'Bieg spokojny', fala: 'Przyspieszenie' });
  else if (typ === 'interwaly') srodek = rdzenInterwalowy(rdzen, u);
  else if (typ === 'narastajacy') srodek = rdzenNarastajacy(rdzen, u);
  else if (typ === 'wytrzymalosc') srodek = rdzenCiagly(rdzen, u.tempo, 'Bieg ciągły', 'Równe tempo, równy oddech');
  // Marsz łagodny nie faluje — dwie kotwice są tam tą samą prędkością,
  // a etykiety „Marsz" i „Żywszy marsz" kłamałyby przy identycznych liczbach.
  else if (u.baza === u.fala) srodek = rdzenCiagly(rdzen, u.baza, 'Marsz', 'Równym krokiem');
  else srodek = rdzenFalujacy(rdzen, u, { baza: 'Marsz', fala: 'Żywszy marsz' });

  const ramy_s = kotwicaRam(srodek);
  const segments = [
    { t: wu, s: ramy_s, i: 0, kind: 'warmup', label: 'Rozgrzewka' },
    ...srodek.map((s) => ({ i: 0, ...s })),
    { t: cd, s: ramy_s, i: 0, kind: 'cooldown', label: 'Schłodzenie' },
  ].filter((s) => s.t > 0);

  return {
    id: nowyId(),
    name: (nazwa || '').trim() || opisTypu.nazwa + ' ' + min + ' min',
    focus: opisTypu.focus,
    level: opisInt.level,
    desc: opisTypu.opis,
    custom: true,
    utworzono: new Date().toISOString(),
    // Parametry zostają przy planie, żeby dało się go później wygenerować
    // jeszcze raz z inną długością, nie zgadując, skąd się wziął.
    generator: { typ, minuty: min, intensywnosc },
    segments,
  };
}

/** Krótkie zdanie o budowie planu — do podglądu w kreatorze. */
export function opisBudowy(plan) {
  const praca = plan.segments.filter((s) => s.kind === 'work');
  const sekund = plan.segments.reduce((a, s) => a + s.t, 0);
  const pracaS = praca.reduce((a, s) => a + s.t, 0);
  return {
    odcinkow: plan.segments.length,
    minut: Math.round(sekund / 60),
    pracaProc: sekund > 0 ? Math.round((pracaS / sekund) * 100) : 0,
  };
}
