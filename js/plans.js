// Biblioteka planów treningowych.
//
// Prędkości nie są zapisane na sztywno w km/h, tylko jako "kotwice" wysiłku
// (easy, tempo, vo2, ...) przeliczane na km/h z Twojego profilu. Dzięki temu
// ten sam plan skaluje się razem z formą i nie musi być przepisywany.

const S = (t) => t;
const M = (t) => Math.round(t * 60);

/** Rozwija powtórzenia: rep(4, [a, b]) -> [a, b, a, b, a, b, a, b] */
const rep = (n, segs) => Array.from({ length: n }, () => segs.map((s) => ({ ...s }))).flat();

export const DEFAULT_PROFILE = {
  walk: 5.0,       // spokojny marsz
  easy: 8.0,       // tempo, w którym możesz swobodnie rozmawiać
  fast: 11.0,      // tempo, które utrzymasz około 3 minuty
  // Limity nie są ustawiane ręcznie — przy każdym połączeniu przyjmują zakres
  // zgłoszony przez bieżnię (limityZBiezni niżej). Do pierwszego połączenia
  // obowiązuje zakres bieżni FS-CA455B.
  maxSpeedCap: 22,
  maxInclineCap: 20,
  // Używane wyłącznie awaryjnie, gdy bieżnia nie raportuje kalorii. Nie ma
  // pola w interfejsie, bo prędkości od masy nie zależą, a bieżnie z FTMS
  // liczą kalorie same - formularz sugerowałby wpływ, którego nie ma.
  weightKg: 80,
};

/**
 * Kotwice wysiłku. Wszystko pomiędzy "easy" i "fast" jest interpolowane,
 * więc wystarczy, że ustawisz te dwie wartości w profilu.
 */
export function anchorSpeed(anchor, p) {
  const span = Math.max(0.5, p.fast - p.easy);
  const map = {
    stop: 0,
    // Między zerem a marszem nie było nic, a rozgrzewka przed treningiem
    // marszowym musi być wolniejsza od samego marszu — inaczej nie jest
    // rozgrzewką, tylko pierwszym odcinkiem treningu pod inną nazwą.
    stroll: Math.max(2.0, p.walk - 1.2),
    walk: p.walk,
    brisk: p.walk + 1.0,
    jog: Math.max(p.walk + 0.5, p.easy - 1.2),
    easy: p.easy,
    steady: p.easy + 0.35 * span,
    tempo: p.easy + 0.7 * span,
    threshold: p.easy + 0.85 * span,
    vo2: p.fast,
    sprint: p.fast + 1.5,
  };
  const v = map[anchor];
  if (v === undefined) throw new Error('Nieznana kotwica prędkości: ' + anchor);
  return Math.min(p.maxSpeedCap, Math.round(v * 10) / 10);
}

/**
 * Limity profilu wynikające z możliwości bieżni. Działa w obie strony:
 * aplikacja nie wyjdzie poza zakres bieżni, ale też nie tnie planu niżej.
 *
 * Bierzemy tylko zakres faktycznie odczytany z bieżni. Gdy odczyt się nie
 * uda, sterownik podstawia własny domyślny zakres — to zgadywanie, więc nie
 * może ani podnieść, ani obniżyć limitu. Bieżnia bez sterowanej pochylni
 * dostaje limit nachylenia zero: plan nie może obiecywać podbiegu.
 */
export function limityZBiezni(caps) {
  if (!caps?.speedRange) return {};
  const out = {};
  const v = caps.speedRange;
  if (v.odczytany && v.max > 0 && v.max <= 40) out.maxSpeedCap = v.max;
  const i = caps.inclineRange;
  if (!caps.incline) out.maxInclineCap = 0;
  else if (i?.odczytany && i.max >= 0 && i.max <= 40) out.maxInclineCap = i.max;
  return out;
}

/** Zamienia definicję segmentu na konkretne km/h i procent nachylenia. */
export function resolveSegment(seg, profile) {
  const speed = typeof seg.s === 'number' ? Math.min(profile.maxSpeedCap, seg.s)
                                          : anchorSpeed(seg.s, profile);
  const wantedIncline = seg.i ?? 0;
  const incline = Math.min(profile.maxInclineCap, wantedIncline);
  // wantedIncline zachowujemy, żeby interfejs mógł powiedzieć, że plan
  // zakładał podbieg, którego ta bieżnia nie potrafi ustawić.
  return { ...seg, speed, incline, wantedIncline, duration: seg.t };
}

export function resolvePlan(plan, profile) {
  const segments = plan.segments.map((s) => resolveSegment(s, profile));
  const total = segments.reduce((a, s) => a + s.duration, 0);
  const distanceKm = segments.reduce((a, s) => a + (s.speed * s.duration) / 3600, 0);
  return { ...plan, segments, totalSeconds: total, estDistanceKm: Math.round(distanceKm * 100) / 100 };
}

const WU = (t = M(5), s = 'walk', i = 0) => ({ t, s, i, kind: 'warmup', label: 'Rozgrzewka' });
const CD = (t = M(5)) => ({ t, s: 'walk', i: 0, kind: 'cooldown', label: 'Schłodzenie' });

export const PLANS = [
  {
    id: 'easy-30',
    name: 'Rozbieganie 30 min',
    focus: 'Baza tlenowa',
    level: 1,
    desc: 'Spokojny, równy bieg w strefie 2. Fundament każdego planu — buduje wydolność bez obciążania organizmu.',
    segments: [
      WU(M(5)),
      { t: M(3), s: 'jog', kind: 'warmup', label: 'Wprowadzenie do biegu' },
      { t: M(15), s: 'easy', kind: 'work', label: 'Bieg spokojny', cue: 'Oddychaj nosem, powinieneś móc rozmawiać' },
      { t: M(4), s: 'jog', kind: 'cooldown', label: 'Wytruchtanie' },
      CD(M(3)),
    ],
  },
  {
    id: 'z2-fat-45',
    name: 'Spalanie tłuszczu 45 min',
    focus: 'Wytrzymałość / redukcja',
    level: 1,
    desc: 'Długi wysiłek o niskiej intensywności z delikatnie falującą prędkością. Zmiany są na tyle małe, że tętno cały czas zostaje w strefie tlenowej, a na tyle wyraźne, żeby nie zasnąć z nudów.',
    segments: [
      WU(M(5)),
      ...rep(4, [
        { t: M(4), s: 'easy', kind: 'work', label: 'Spokojnie' },
        { t: M(4), s: 'steady', kind: 'work', label: 'Odrobinę żywiej', cue: 'Oddech ma zostać równy' },
        { t: M(1), s: 'jog', kind: 'recovery', label: 'Luz' },
      ]),
      CD(M(4)),
    ],
  },
  {
    id: 'fitshow-fat-30',
    name: 'Spalanie tłuszczu 30 min',
    focus: 'Redukcja / interwały',
    level: 2,
    desc: 'Plan odtworzony z aplikacji FitShow („30 Minute Fat Burning Run"). Pięć bloków biegowych 8–9 km/h przeplatanych marszem. Prędkości są tu wpisane wprost, a nie przeliczane z profilu — dokładnie takie, jakie ustawiała FitShow. Jeśli okażą się za łatwe albo za trudne, użyj w trakcie przycisków ±0,5 km/h; korekta przenosi się na wszystkie kolejne odcinki.',
    segments: [
      { t: M(3), s: 3.5, kind: 'warmup', label: 'Rozgrzewka' },
      // Cztery pełne bloki po pięć minut, każdy zamknięty marszem.
      ...rep(4, [
        { t: M(1), s: 8.0, kind: 'work', label: 'Bieg' },
        { t: M(2), s: 9.0, kind: 'work', label: 'Mocniej' },
        { t: M(1), s: 8.0, kind: 'work', label: 'Bieg' },
        { t: M(1), s: 5.0, kind: 'recovery', label: 'Marsz' },
      ]),
      // Piąty blok bez marszu na końcu — tak wychodzi równe trzydzieści minut.
      { t: M(1), s: 8.0, kind: 'work', label: 'Bieg' },
      { t: M(2), s: 9.0, kind: 'work', label: 'Mocniej' },
      { t: M(1), s: 8.0, kind: 'work', label: 'Ostatni odcinek' },
      { t: M(3), s: 4.5, kind: 'cooldown', label: 'Schłodzenie' },
    ],
  },
  {
    id: 'walk-run-40',
    name: 'Marszobieg 40 min',
    focus: 'Redukcja / powrót po przerwie',
    level: 1,
    desc: 'Naprzemiennie trzy minuty truchtu i dwie minuty marszu. Bez pochylni to najuczciwszy sposób na długi wysiłek przy niskim obciążeniu stawów — sumarycznie robisz sporo pracy, ale nigdzie nie ma momentu, który by Cię rozbił.',
    segments: [
      { t: M(4), s: 'walk', kind: 'warmup', label: 'Marsz na rozgrzewkę' },
      ...rep(6, [
        { t: M(3), s: 'jog', kind: 'work', label: 'Trucht' },
        { t: M(2), s: 'brisk', kind: 'recovery', label: 'Marsz', cue: 'Nie trzymaj się poręczy' },
      ]),
      { t: M(3), s: 'easy', kind: 'work', label: 'Ostatni odcinek biegu' },
      CD(M(3)),
    ],
  },
  {
    id: 'cruise-5x5',
    name: 'Interwały progowe 5 × 5 min',
    focus: 'Próg mleczanowy',
    level: 3,
    desc: 'Pięć pięciominutowych odcinków tuż pod progiem, z minutową przerwą. Na płaskiej bieżni to najskuteczniejszy zamiennik podbiegów — obciążenie bierze się z czasu spędzonego przy progu, nie z nachylenia.',
    segments: [
      WU(M(4)),
      { t: M(5), s: 'easy', kind: 'warmup', label: 'Rozbieganie' },
      ...rep(5, [
        { t: M(5), s: 'threshold', kind: 'work', label: 'Odcinek progowy', cue: 'Ciężko, ale równo — to nie sprint' },
        { t: M(1), s: 'jog', kind: 'recovery', label: 'Przerwa' },
      ]),
      { t: M(2), s: 'jog', kind: 'cooldown', label: 'Wytruchtanie' },
      CD(M(3)),
    ],
  },
  {
    id: 'int-4x4',
    name: 'Interwały norweskie 4 × 4',
    focus: 'VO2max',
    level: 3,
    desc: 'Klasyk z Trondheim: cztery czterominutowe odcinki na 90–95% tętna maksymalnego, przeplatane trzyminutowym truchtem. Najlepiej udokumentowany protokół podnoszenia pułapu tlenowego.',
    segments: [
      WU(M(4)),
      { t: M(6), s: 'easy', kind: 'warmup', label: 'Rozbieganie' },
      ...rep(4, [
        { t: M(4), s: 'vo2', kind: 'work', label: 'Interwał 4 min', cue: 'Powinno być ciężko — mowa niemożliwa' },
        { t: M(3), s: 'jog', i: 0, kind: 'recovery', label: 'Trucht 3 min' },
      ]),
      { t: M(3), s: 'jog', kind: 'cooldown', label: 'Wytruchtanie' },
      CD(M(4)),
    ],
  },
  {
    id: 'int-30-30',
    name: 'Interwały 30/30',
    focus: 'VO2max / szybkość',
    level: 3,
    desc: 'Dwanaście powtórzeń 30 sekund szybko / 30 sekund trucht. Krótkie odcinki pozwalają zebrać dużo czasu na wysokiej intensywności bez tak dużego zmęczenia jak przy długich interwałach.',
    segments: [
      WU(M(4)),
      { t: M(5), s: 'easy', kind: 'warmup', label: 'Rozbieganie' },
      ...rep(12, [
        { t: S(30), s: 'vo2', kind: 'work', label: '30 s szybko' },
        { t: S(30), s: 'jog', kind: 'recovery', label: '30 s trucht' },
      ]),
      { t: M(3), s: 'jog', kind: 'cooldown', label: 'Wytruchtanie' },
      CD(M(4)),
    ],
  },
  {
    id: 'int-pyramid',
    name: 'Piramida 1-2-3-4-3-2-1',
    focus: 'Wytrzymałość tempowa',
    level: 3,
    desc: 'Odcinki rosną do czterech minut i schodzą z powrotem. Uczy rozkładania sił i dobrze znosi monotonię bieżni.',
    segments: [
      WU(M(4)),
      { t: M(5), s: 'easy', kind: 'warmup', label: 'Rozbieganie' },
      { t: M(1), s: 'vo2', kind: 'work', label: '1 min' },
      { t: M(1), s: 'jog', kind: 'recovery', label: 'Przerwa' },
      { t: M(2), s: 'threshold', kind: 'work', label: '2 min' },
      { t: M(1.5), s: 'jog', kind: 'recovery', label: 'Przerwa' },
      { t: M(3), s: 'tempo', kind: 'work', label: '3 min' },
      { t: M(2), s: 'jog', kind: 'recovery', label: 'Przerwa' },
      { t: M(4), s: 'tempo', kind: 'work', label: '4 min — szczyt', cue: 'Najdłuższy odcinek, trzymaj rytm' },
      { t: M(2), s: 'jog', kind: 'recovery', label: 'Przerwa' },
      { t: M(3), s: 'tempo', kind: 'work', label: '3 min' },
      { t: M(1.5), s: 'jog', kind: 'recovery', label: 'Przerwa' },
      { t: M(2), s: 'threshold', kind: 'work', label: '2 min' },
      { t: M(1), s: 'jog', kind: 'recovery', label: 'Przerwa' },
      { t: M(1), s: 'vo2', kind: 'work', label: '1 min — ostatni' },
      CD(M(5)),
    ],
  },
  {
    id: 'tempo-20',
    name: 'Bieg tempowy 20 min',
    focus: 'Próg mleczanowy',
    level: 2,
    desc: 'Dwadzieścia minut w tempie "komfortowo ciężkim" — mniej więcej takim, jakie utrzymasz przez godzinę na zawodach. Podnosi próg mleczanowy.',
    segments: [
      WU(M(4)),
      { t: M(6), s: 'easy', kind: 'warmup', label: 'Rozbieganie' },
      { t: M(20), s: 'tempo', kind: 'work', label: 'Tempo', cue: 'Komfortowo ciężko — krótkie zdania, nie rozmowa' },
      { t: M(4), s: 'jog', kind: 'cooldown', label: 'Wytruchtanie' },
      CD(M(4)),
    ],
  },
  {
    id: 'fartlek-35',
    name: 'Fartlek 35 min',
    focus: 'Mieszany',
    level: 2,
    desc: 'Zabawa biegowa: nieregularne przyspieszenia o różnej długości. Bieżnia zmienia prędkość sama, więc dostajesz element zaskoczenia, którego zwykle brakuje w domu.',
    segments: [
      WU(M(4)),
      { t: M(4), s: 'easy', kind: 'warmup', label: 'Rozbieganie' },
      { t: M(2), s: 'tempo', kind: 'work', label: 'Przyspieszenie 2 min' },
      { t: M(2), s: 'easy', kind: 'recovery', label: 'Luz' },
      { t: S(45), s: 'vo2', kind: 'work', label: 'Zryw 45 s' },
      { t: M(1.5), s: 'jog', kind: 'recovery', label: 'Luz' },
      { t: M(3), s: 'steady', kind: 'work', label: 'Mocniejszy blok 3 min' },
      { t: M(2), s: 'easy', kind: 'recovery', label: 'Luz' },
      { t: S(30), s: 'sprint', kind: 'work', label: 'Sprint 30 s' },
      { t: M(2), s: 'jog', kind: 'recovery', label: 'Luz' },
      { t: M(4), s: 'tempo', kind: 'work', label: 'Tempo 4 min' },
      { t: M(2), s: 'easy', kind: 'recovery', label: 'Luz' },
      { t: M(2), s: 'vo2', kind: 'work', label: 'Ostatnie dwie minuty' },
      CD(M(5)),
    ],
  },
  {
    id: 'hiit-20',
    name: 'HIIT sprinty 20 min',
    focus: 'Moc / metabolizm',
    level: 3,
    desc: 'Krótko i bardzo intensywnie. Osiem sprintów po 20 sekund z pełną przerwą. Uwaga: przy tej prędkości rampa startuje wcześniej, żeby pas nie szarpnął.',
    segments: [
      WU(M(3)),
      { t: M(3), s: 'easy', kind: 'warmup', label: 'Rozbieganie' },
      ...rep(8, [
        { t: S(20), s: 'sprint', kind: 'work', label: 'Sprint 20 s', cue: 'Maksimum, ale kontrolowane' },
        { t: S(70), s: 'walk', kind: 'recovery', label: 'Marsz — pełna przerwa' },
      ]),
      CD(M(2)),
    ],
  },
  {
    id: 'progression-40',
    name: 'Bieg progresywny 40 min',
    focus: 'Kontrola tempa',
    level: 2,
    desc: 'Zaczynasz spokojnie i co pięć minut przyspieszasz. Ostatnie dziesięć minut jest naprawdę wymagające — najlepszy trening mentalny na finisz.',
    segments: [
      WU(M(4)),
      { t: M(6), s: 'jog', kind: 'warmup', label: 'Rozbieganie' },
      { t: M(5), s: 'easy', kind: 'work', label: 'Etap 1' },
      { t: M(5), s: 'steady', kind: 'work', label: 'Etap 2' },
      { t: M(5), s: 'tempo', kind: 'work', label: 'Etap 3' },
      { t: M(5), s: 'threshold', kind: 'work', label: 'Etap 4' },
      { t: M(5), s: 'vo2', kind: 'work', label: 'Etap 5 — finisz', cue: 'Ostatnie pięć minut, nie odpuszczaj' },
      { t: M(2), s: 'jog', kind: 'cooldown', label: 'Wytruchtanie' },
      CD(M(3)),
    ],
  },
  {
    id: 'long-60',
    name: 'Długie wybieganie 60 min',
    focus: 'Wytrzymałość',
    level: 2,
    desc: 'Godzina w spokojnym tempie z lekkimi zmianami nachylenia, żeby rozłożyć obciążenie na różne grupy mięśni. Podstawa przygotowania do dłuższych dystansów.',
    segments: [
      WU(M(5)),
      { t: M(5), s: 'jog', kind: 'warmup', label: 'Rozbieganie' },
      ...rep(3, [
        { t: M(6), s: 'easy', kind: 'work', label: 'Blok spokojny' },
        { t: M(4), s: 'jog', kind: 'recovery', label: 'Blok wolniejszy' },
        { t: M(5), s: 'steady', kind: 'work', label: 'Blok żywszy' },
      ]),
      { t: M(2), s: 'jog', kind: 'cooldown', label: 'Wytruchtanie' },
      CD(M(3)),
    ],
  },
  {
    id: 'recovery-20',
    name: 'Regeneracja 20 min',
    focus: 'Odnowa',
    level: 1,
    desc: 'Bardzo lekki trucht na dzień po mocnej sesji. Ma poprawić krążenie, nie zmęczyć.',
    segments: [
      { t: M(4), s: 'walk', kind: 'warmup', label: 'Marsz' },
      { t: M(12), s: 'jog', kind: 'work', label: 'Lekki trucht', cue: 'Jeśli masz wątpliwości, zwolnij' },
      { t: M(4), s: 'walk', kind: 'cooldown', label: 'Marsz' },
    ],
  },
  {
    id: 'test-cooper',
    name: 'Test Coopera (12 min)',
    focus: 'Pomiar formy',
    level: 3,
    desc: 'Dwanaście minut na maksymalny dystans. Nie ustawia prędkości za Ciebie — tutaj sterujesz ręcznie, a aplikacja mierzy dystans i przelicza szacowany VO2max.',
    manual: true,
    segments: [
      WU(M(3)),
      { t: M(5), s: 'easy', kind: 'warmup', label: 'Rozbieganie' },
      { t: M(12), s: 'tempo', kind: 'work', label: 'TEST — 12 min', cue: 'Tempo ustawiasz sam. Cel: maksymalny dystans' },
      CD(M(5)),
    ],
  },
];

export const planById = (id) => PLANS.find((p) => p.id === id);

export const KIND_LABEL = {
  warmup: 'Rozgrzewka',
  work: 'Praca',
  recovery: 'Przerwa',
  cooldown: 'Schłodzenie',
};

/**
 * Nachylenie w terenie to połowa nachylenia bieżni — pas nie daje tego, co
 * prawdziwe zbocze. 10 km na 20 % bieżni to więc 1 km w górę. Tej samej
 * reguły używa edytor (plan) i silnik (to, co faktycznie przebiegłeś).
 */
export const nachylenieTerenu = (i) => i / 2;

/** Metry w górę na odcinku o danej długości i nachyleniu bieżni. */
export const przewyzszenie = (metry, nachylenieBiezni) =>
  metry * (nachylenieTerenu(Math.max(0, nachylenieBiezni)) / 100);

/** Szacowany VO2max z testu Coopera (dystans w metrach). */
export const cooperVo2 = (meters) => Math.round(((meters - 504.9) / 44.73) * 10) / 10;

export const fmtTime = (sec) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? h + ':' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0')
    : m + ':' + String(r).padStart(2, '0');
};
