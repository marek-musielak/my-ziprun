// Ekran treningu: pierścienie, liczby z każdego taktu silnika, sterowanie
// i domknięcie treningu wraz z zapisem technicznym.

import { KIND_LABEL, fmtTime } from '../plans.js';
import { STATE } from '../engine.js';
import * as store from '../storage.js';
import { $, el, tm, speech, keeper, engine, trace, stan, opisWyniku, toast, esc } from './core.js';
import { showSummary } from './summary.js';

// Ile sekund przed zmianą prędkości środek pierścienia przechodzi
// w odliczanie. Dziesięć sekund to już zapowiedź głosowa, trzy byłoby za
// późno, żeby się przygotować.
const ODLICZANIE_S = 5;

// Obwody obu pierścieni: 2*pi*80 (wewnętrzny) i 2*pi*95 (zewnętrzny).
const RING = 502.65;
const RING_TOTAL = 596.90;
const PROMIEN_ZEWN = 95;
// Przerwa między łukami odcinków, w jednostkach obwodu. Przy bardzo krótkich
// odcinkach łuk zostaje mimo to widoczny — patrz Math.max niżej.
const PRZERWA_LUKU = 3;

let runSaved = false;
let msgTimer;

/** Łuk pojedynczego odcinka jako okrąg z jedną kreską na obwodzie. */
function lukOdcinka(dlugosc, poczatekUlamek, klasa) {
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '100');
  c.setAttribute('cy', '100');
  c.setAttribute('r', String(PROMIEN_ZEWN));
  c.setAttribute('class', klasa);
  c.setAttribute('stroke-dasharray', dlugosc + ' ' + (RING_TOTAL - dlugosc));
  c.setAttribute('stroke-dashoffset', String(-poczatekUlamek * RING_TOTAL));
  return c;
}

let lukiOdcinkow = [];

/**
 * Buduje zewnętrzny pierścień z osobnym łukiem na każdy odcinek planu.
 * Wywoływane raz na trening — długości zależą od planu, nie od postępu.
 */
function zbudujPierscienOdcinkow(plan) {
  // Pierwszy takt przyjdzie dopiero po odliczaniu bieżni — do tego czasu łuk
  // odcinka ma być pusty, a nie pełny.
  $('ring-fg').style.strokeDashoffset = String(RING);
  const g = $('ring-segments');
  g.innerHTML = '';
  lukiOdcinkow = [];
  const calosc = plan.totalSeconds;
  if (!calosc) return;

  let narastajaco = 0;
  for (const seg of plan.segments) {
    const poczatek = narastajaco / calosc;
    const pelna = (seg.duration / calosc) * RING_TOTAL;
    // Bardzo krótkie odcinki (30 s w planie 30-minutowym) muszą zostać
    // widoczne, więc przerwa nigdy nie zjada całego łuku.
    const dlugosc = Math.max(2, pelna - PRZERWA_LUKU);
    g.appendChild(lukOdcinka(dlugosc, poczatek, 'seg-arc seg-arc-bg'));
    const przod = lukOdcinka(0, poczatek, 'seg-arc seg-arc-fg');
    g.appendChild(przod);
    lukiOdcinkow.push({ el: przod, dlugosc, od: narastajaco, trwanie: seg.duration });
    narastajaco += seg.duration;
  }
}

/** Wypełnia łuki proporcjonalnie do czasu, który upłynął. */
function odswiezPierscienOdcinkow(uplynelo) {
  for (const l of lukiOdcinkow) {
    const u = Math.min(1, Math.max(0, (uplynelo - l.od) / l.trwanie));
    const d = u * l.dlugosc;
    l.el.setAttribute('stroke-dasharray', d + ' ' + (RING_TOTAL - d));
  }
}

/** Czyści ekran treningu przed startem nowego planu. */
export function przygotujEkranTreningu(rozpisany) {
  zbudujPierscienOdcinkow(rozpisany);
  // Komunikat z poprzedniego treningu zostawał na ekranie i wyglądał jak
  // informacja o bieżącym — „Trening zatrzymany." tuż po starcie nowego.
  clearTimeout(msgTimer);
  $('run-msg').textContent = '';
  runSaved = false;
}

/**
 * Bieżnia bez sterowanej pochylni pokazywałaby stałe zero i miała dwa martwe
 * przyciski — chowamy je i oddajemy miejsce przyciskowi zmiany odcinka.
 */
export function updateInclineUi() {
  const has = stan.profile.maxInclineCap > 0;
  $('tile-incline').classList.toggle('hidden', !has);
  $('tile-avg').classList.toggle('hidden', has);
  $('c-inc-up').classList.toggle('hidden', !has);
  $('c-inc-down').classList.toggle('hidden', !has);
  el('.controls').classList.toggle('no-incline', !has);
}

function paceStr(kmh) {
  if (!kmh || kmh < 0.5) return '—';
  const total = 60 / kmh;
  const m = Math.floor(total);
  const s = Math.round((total - m) * 60);
  return m + ':' + String(s).padStart(2, '0');
}

engine.on('tick', (d) => {
  if (d.countdown != null) {
    $('run-countdown').classList.remove('hidden');
    $('cd-num').textContent = d.countdown;
    return;
  }
  $('run-countdown').classList.add('hidden');

  const profile = stan.profile;
  const seg = d.segment;
  const kind = KIND_LABEL[seg.kind] || '';
  const pozycja = (d.segIndex + 1) + '/' + engine.plan.segments.length;
  // Nie powtarzamy nagłówka, gdy nazwa odcinka jest tym samym słowem.
  // Gdy rodzaj odcinka powtarza jego nazwę, pomijamy go — ale wtedy sama
  // liczba byłaby zagadką, więc dostaje słowo wyjaśniające.
  $('run-kind').textContent = kind === seg.label
    ? 'odcinek ' + pozycja
    : kind + ' · ' + pozycja;
  $('run-label').textContent = seg.label;
  // Rodzaj odcinka steruje kolorem poświaty za pierścieniem i nagłówka.
  // Reszta dzieje się w CSS — tutaj tylko mówimy, co się właśnie dzieje.
  $('view-run').dataset.kind = seg.kind || 'work';

  // Przez ostatnie sekundy odcinka środek pierścienia przestaje pokazywać
  // czas, a zaczyna odliczać do nowego tempa. Wcześniej mówił o tym tylko
  // mały napis pod prędkością — za mało, żeby zdążyć się przygotować.
  const nadchodzi = engine.nextSegment;
  const odliczanie = !!nadchodzi && d.segRemaining <= ODLICZANIE_S;
  $('view-run').classList.toggle('odliczanie', odliczanie);
  if (odliczanie) {
    $('run-segtime').textContent = String(Math.max(1, Math.ceil(d.segRemaining)));
    $('ring-sub').textContent = nadchodzi.label + ' · ' +
      engine.targetSpeedFor(nadchodzi).toFixed(1).replace('.', ',') + ' km/h';
  } else {
    $('run-segtime').textContent = fmtTime(d.segRemaining);
    $('ring-sub').textContent = 'do końca odcinka';
  }

  // Łuk przyrasta w miarę trwania odcinka, tak samo jak zewnętrzny pierścień
  // całego treningu — dwa postępy obok siebie muszą iść w tę samą stronę.
  // Liczba w środku nadal odlicza do zera, bo to ona mówi, ile jeszcze zostało.
  const zrobione = seg.duration > 0 ? 1 - d.segRemaining / seg.duration : 0;
  $('ring-fg').style.strokeDashoffset = String(RING * (1 - zrobione));

  const actual = d.metrics.speed;
  $('run-speed').textContent = (actual != null ? actual : d.targetSpeed).toFixed(1).replace('.', ',');
  // W trakcie rampy pokazujemy cel, do którego pas właśnie zmierza, a nie cel
  // kończącego się odcinka — inaczej liczba kłóciłaby się z zachowaniem bieżni.
  $('run-target').textContent = (d.ramping ? d.ramping.target : d.targetSpeed).toFixed(1).replace('.', ',');
  $('run-total').textContent = fmtTime(d.totalRemaining);
  $('run-dist').textContent = (d.distanceM / 1000).toFixed(2).replace('.', ',');
  $('run-incline').textContent = String(d.metrics.incline ?? d.targetIncline);
  const avg = d.totalElapsed > 0 ? (d.distanceM / 1000) / (d.totalElapsed / 3600) : 0;
  $('run-avg').textContent = avg.toFixed(1).replace('.', ',');
  $('run-kcal').textContent = String(d.metrics.kcal ?? Math.round(profile.weightKg * (d.distanceM / 1000) * 1.036));
  $('run-hr').textContent = d.metrics.hr ? String(d.metrics.hr) : '—';
  $('run-pace').textContent = paceStr(actual ?? d.targetSpeed);

  // Zewnętrzny pierścień to postęp całego treningu, wewnętrzny — bieżącego
  // odcinka. Dwie różne informacje, ale obie rosną w tę samą stronę.
  odswiezPierscienOdcinkow(d.totalElapsed);
  const kcal = d.metrics.kcal ?? Math.round(profile.weightKg * (d.distanceM / 1000) * 1.036);
  // Każda para liczba + podpis jest osobnym kawałkiem, żeby zawijanie nie
  // rozdzieliło słowa "zostało" od czasu, który opisuje.
  const czesci = [
    '<b>' + (d.distanceM / 1000).toFixed(2).replace('.', ',') + '</b> km',
    '<b>' + kcal + '</b> kcal',
    'zostało <b>' + fmtTime(d.totalRemaining) + '</b>',
  ];
  if (d.metrics.hr) czesci.push('<b>' + d.metrics.hr + '</b> bpm');
  $('run-mini').innerHTML = czesci.map((x) => '<span>' + x + '</span>').join('');

  const off = $('run-offset');
  if (engine.speedOffset !== 0) {
    off.textContent = (engine.speedOffset > 0 ? '+' : '') + engine.speedOffset.toFixed(1).replace('.', ',');
    off.classList.remove('hidden');
  } else off.classList.add('hidden');

  // Skala przejęta z panelu bieżni. Musi być widoczna — inaczej prędkości
  // kolejnych odcinków nie zgadzałyby się z planem bez żadnego wyjaśnienia.
  const fac = $('run-factor');
  const proc = Math.round(((d.speedFactor ?? 1) - 1) * 100);
  if (proc !== 0) {
    fac.textContent = (proc > 0 ? '+' : '') + proc + '% planu';
    fac.classList.remove('hidden');
  } else fac.classList.add('hidden');


  // Pas zmienia prędkość zanim zegar dojdzie do końca odcinka, żeby interwał
  // zaczynał się już na docelowym tempie. Bez tego komunikatu ekran pokazywałby
  // stary odcinek i stary cel, choć bieżnia robi już co innego.
  // Odkąd zmianę tempa odlicza pierścień, to pudełko ma jedną rolę: mówi,
  // co będzie dalej. Wcześniej w trakcie rampy zmieniało się w komunikat
  // „Rozpędzam do…", czyli dublowało informację małym drukiem.
  $('run-next').innerHTML = nadchodzi
    ? 'Dalej: <b>' + esc(nadchodzi.label) + '</b> · ' +
      engine.targetSpeedFor(nadchodzi).toFixed(1).replace('.', ',') +
      ' km/h · ' + fmtTime(nadchodzi.duration)
    : 'Ostatni odcinek';
});

engine.on('state', (s) => {
  $('c-pause').textContent = s === STATE.PAUSED ? 'Wznów' : 'Pauza';
  if (s === STATE.FINISHED || s === STATE.ABORTED) keeper.release();
});

// Kiedy bieżnia ostatnio potwierdziła zatrzymanie własną ramką statusu.
// Nasłuch rejestrujemy raz, bo warstwa BLE nie ma wyrejestrowywania.
let potwierdzonyStopTs = 0;
tm.on('status', (s) => { if (s.opcode === 0x02) potwierdzonyStopTs = Date.now(); });

// Ile czekamy na tę ramkę po tym, jak pas już stanie. Bieżnia wysyła ją
// mniej więcej w chwili zatrzymania, czyli dokładnie na granicy poprzedniego
// zapasu — raz zdążyła, raz nie. Trzy sekundy zamykają tę loterię.
const POTWIERDZENIE_S = 3;

/**
 * Czeka, aż bieżnia zwolni do zera i potwierdzi to własną ramką statusu.
 * Hamowanie trwa tym dłużej, im szybciej biegłeś (około pół km/h na sekundę),
 * więc sztywne opóźnienie albo ucinałoby zapis, albo kazało czekać bez
 * potrzeby. Bez połączenia kończy od razu.
 */
async function waitForBeltStop(maxS = 30) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxS * 1000) {
    if ((tm.metrics?.speed ?? 0) <= 0.1) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  // Pas stoi — teraz czekamy jeszcze na potwierdzenie z bieżni, ale nie
  // dłużej niż POTWIERDZENIE_S: bez połączenia albo przy protokole, który
  // takiej ramki nie wysyła, nie ma na co czekać w nieskończoność.
  // Bez połączenia nie ma od kogo czekać na potwierdzenie — trening
  // w trybie prowadzenia kończyłby się wtedy trzema sekundami zwłoki
  // za nic.
  const t1 = Date.now();
  while (tm.connected && potwierdzonyStopTs < t0 && Date.now() - t1 < POTWIERDZENIE_S * 1000) {
    await new Promise((r) => setTimeout(r, 200));
  }
  // Chwila zapasu, żeby ramka zdążyła trafić do zapisu.
  await new Promise((r) => setTimeout(r, 400));
}

/**
 * "ended" leci dopiero po wysłaniu komendy zatrzymania pasa — inaczej
 * najważniejszy moment treningu wypadałby poza zapisem technicznym.
 */
engine.on('ended', async (sum) => {
  // Zabezpieczenie przed dwukrotnym zapisem tego samego treningu.
  if (runSaved) return;
  runSaved = true;
  // Kontekst sprzętowy dopisujemy tutaj — silnik nic nie wie o połączeniu.
  sum.device = tm.device?.name || null;
  sum.auto = engine.autoControl;
  stan.lastSummary = sum;
  store.addHistory(sum);
  showSummary(sum);

  // Rejestrator dopisuje do chwili, aż pas faktycznie stanie — zamiast
  // zgadywać czas hamowania, który zależy od prędkości końcowej. Podsumowanie
  // jest już na ekranie, więc to czekanie niczego nie blokuje.
  await waitForBeltStop();
  trace.stop();
  // Wynik wpisujemy do metadanych zapisu, a nie dopiero przy pobieraniu.
  // Inaczej plik pobrany później z listy zapisów nie miał w nagłówku ani
  // czasu, ani dystansu — a to pierwsze, czego się w nim szuka.
  trace.meta.wynik = opisWyniku(sum);
  store.addTrace({
    date: sum.date,
    planName: sum.planName,
    completed: sum.completed,
    data: trace.toStored(),
  });
});

engine.on('msg', (m) => {
  $('run-msg').textContent = m;
  toast(m);
  // Komunikat znika sam. Bez tego ostrzeżenie sprzed dwudziestu minut wisiało
  // na ekranie do końca treningu, udając bieżącą informację.
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { $('run-msg').textContent = ''; }, 12000);
});
engine.on('segment', () => speech.beep(engine.segment.kind === 'work' ? 1040 : 720, 130));

$('c-pause').addEventListener('click', () => {
  if (engine.state === STATE.PAUSED) engine.resume();
  else engine.pause();
});
$('c-skip').addEventListener('click', () => engine.skipSegment());
$('c-faster').addEventListener('click', () => engine.adjustSpeed(+0.5));
$('c-slower').addEventListener('click', () => engine.adjustSpeed(-0.5));
$('c-inc-up').addEventListener('click', () => engine.adjustIncline(+1));
$('c-inc-down').addEventListener('click', () => engine.adjustIncline(-1));
async function endWorkout() {
  if (!confirm('Zatrzymać trening i pas bieżni?')) return;
  await engine.abort('Trening zatrzymany.');
}
$('c-stop').addEventListener('click', endWorkout);
$('btn-end').addEventListener('click', endWorkout);

/**
 * Przełącznik trybu ekranu treningu. Kompaktowy pokazuje tylko to, na co
 * patrzy się w biegu; pełny dokłada kafelki i przyciski sterowania dla tych,
 * którzy wolą zmieniać prędkość z telefonu, a nie z panelu bieżni.
 */
// Ikony przełącznika: kilka prostokątów = pełny panel, jeden = kompaktowy.
// Rysowane, a nie brane ze znaków Unicode, żeby nie zależeć od czcionki telefonu.
const IKONA_PELNY =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<rect x="3" y="3" width="18" height="6.5" rx="1.5"/>' +
  '<rect x="3" y="13" width="8" height="8" rx="1.5"/>' +
  '<rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>';
const IKONA_KOMPAKT =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<rect x="3" y="3" width="18" height="18" rx="2.5"/></svg>';

export function applyRunMode() {
  const compact = stan.settings.compact;
  $('view-run').classList.toggle('compact', compact);
  const btn = $('btn-mode');
  btn.innerHTML = compact ? IKONA_PELNY : IKONA_KOMPAKT;
  btn.title = compact ? 'Pełny panel ze sterowaniem' : 'Tryb kompaktowy';
  btn.setAttribute('aria-label', btn.title);
  const sw = $('s-compact');
  if (sw) sw.checked = compact;
}

$('btn-mode').addEventListener('click', () => {
  stan.settings.compact = !stan.settings.compact;
  store.saveSettings(stan.settings);
  applyRunMode();
  toast(stan.settings.compact ? 'Tryb kompaktowy' : 'Pełny panel ze sterowaniem');
});
