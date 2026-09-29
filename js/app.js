// Spinacz całości: nawigacja, renderowanie widoków i podłączenie silnika
// treningu do interfejsu.

import { Treadmill, bleAvailable } from './ble/manager.js';
import { PLANS, planById, resolvePlan, anchorSpeed, fmtTime, KIND_LABEL, cooperVo2 } from './plans.js';
import { WorkoutEngine, STATE } from './engine.js';
import { Speech, ScreenKeeper } from './speech.js';
import { parseHex, KNOWN_NAMES } from './ble/uuids.js';
import { Trace, poczekajNaKoniecZapisu } from './trace.js';
import { VERSION, CHANGELOG, currentEntry } from './version.js';
import { TYPY, INTENSYWNOSCI, MIN_MINUT, MAX_MINUT, generujPlan } from './generator.js';
import * as store from './storage.js';

const $ = (id) => document.getElementById(id);
const el = (sel) => document.querySelector(sel);
const els = (sel) => [...document.querySelectorAll(sel)];

const tm = new Treadmill();
const speech = new Speech();
const keeper = new ScreenKeeper();
const engine = new WorkoutEngine(tm, speech);
// Rejestrator podłącza się do zdarzeń, które i tak są emitowane - nie ingeruje
// w silnik ani w warstwę BLE, więc nie może zepsuć samego treningu.
const trace = new Trace().attach(tm, engine);

let profile = store.loadProfile();
let settings = store.loadSettings();
let selectedPlan = null;
let levelFilter = 'all';
let wlasnePlany = store.loadPlans();
let ulubione = store.loadFavourites();
const czyUlubiony = (id) => ulubione.includes(id);

/** Plany własne na początku listy — to one są świeże i to ich się szuka. */
const wszystkiePlany = () => [...wlasnePlany, ...PLANS];
const znajdzPlan = (id) => wlasnePlany.find((p) => p.id === id) || planById(id);
let lastSummary = null;

/** Jedno zdanie o wyniku treningu — trafia do nagłówka zapisu technicznego. */
const opisWyniku = (sum) => !sum ? '-' :
  fmtTime(sum.durationS) + ', ' + sum.distanceKm.toFixed(2) + ' km' +
  (sum.completed ? ', ukończony' : ', przerwany');

let runSaved = false;

speech.enabled = settings.voice;

// ---------------------------------------------------------------- nawigacja

let currentView = 'plans';
let prevView = 'plans';
// Ustawiane na czas obsługi gestu wstecz, żeby powrót nie dokładał kolejnego
// wpisu do historii — inaczej cofanie nigdy by z aplikacji nie wyszło.
let zHistorii = false;

/**
 * Nie każdy widok da się pokazać w dowolnej chwili. Gest wstecz może trafić
 * w trening, którego już nie ma, albo w szczegóły planu po przeładowaniu
 * strony — wtedy zamiast pustego szkieletu pokazujemy listę planów.
 */
function dozwolonyWidok(name) {
  if (name === 'run' && !treningTrwa()) return 'plans';
  if (name === 'plan' && !selectedPlan) return 'plans';
  return name;
}

function goto(name) {
  if (name !== currentView) { prevView = currentView; currentView = name; }
  els('.view').forEach((v) => v.classList.remove('active'));
  $('view-' + name)?.classList.add('active');
  els('.tab').forEach((t) => t.classList.toggle('active', t.dataset.goto === name));
  window.scrollTo(0, 0);
  if (name === 'history') renderHistory();
  if (name === 'profile') renderProfile();
  if (name === 'creator') odswiezKreator();

  // Każde przejście to osobny wpis w historii, więc gest wstecz na telefonie
  // wraca do poprzedniego widoku zamiast zamykać aplikację.
  if (zHistorii) return;
  if (history.state && history.state.view === name) history.replaceState({ view: name }, '');
  else history.pushState({ view: name }, '');
}

window.addEventListener('popstate', (e) => {
  const cel = dozwolonyWidok(e.state?.view || 'plans');
  zHistorii = true;
  goto(cel);
  zHistorii = false;
});

/** Czy trening trwa — wliczając pauzę i odliczanie przed startem. */
const treningTrwa = () =>
  engine.state === STATE.RUNNING || engine.state === STATE.PAUSED || engine.state === STATE.COUNTDOWN;

els('[data-goto]').forEach((b) =>
  b.addEventListener('click', () => {
    // Bez tego zakładka Trening pokazywała pusty szkielet z kreskami zamiast
    // nazwy odcinka, zerowym czasem i pustym paskiem — wyglądało jak awaria.
    if (b.dataset.goto === 'run' && !treningTrwa()) {
      toast('Nie ma aktywnego treningu — wybierz plan z listy.');
      goto('plans');
      return;
    }
    goto(b.dataset.goto);
  })
);

let toastTimer;
function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('err', isError);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

// ------------------------------------------------- wersja i historia zmian

function renderVersion() {
  const cur = currentEntry();
  $('brand-ver').textContent = VERSION;
  $('about-ver').textContent = VERSION;
  $('about-title').textContent = cur.title + ' · ' + cur.date;
  $('cl-current').textContent = VERSION;
}

function renderChangelog() {
  $('cl-list').innerHTML = CHANGELOG.map((e) =>
    '<div class="card">' +
    '<div class="cl-head"><b>' + e.version + '</b>' +
    (e.version === VERSION ? '<span class="cl-now">używana</span>' : '') +
    '<span class="cl-date">' + e.date + '</span></div>' +
    '<div class="cl-title">' + e.title + '</div>' +
    '<ul class="cl-changes">' + e.changes.map((c) => '<li>' + c + '</li>').join('') + '</ul>' +
    '</div>'
  ).join('');
}

$('brand').addEventListener('click', () => { renderChangelog(); goto('changelog'); });
$('btn-changelog').addEventListener('click', () => { renderChangelog(); goto('changelog'); });
$('cl-back').addEventListener('click', () => goto(prevView === 'changelog' ? 'plans' : prevView));

/**
 * Aplikacja aktualizuje się sama w tle, więc bez tego użytkownik nie miałby
 * skąd wiedzieć, że coś się zmieniło.
 */
function announceUpdate() {
  const seen = settings.seenVersion;
  if (seen === VERSION) return;
  settings.seenVersion = VERSION;
  store.saveSettings(settings);
  if (!seen) return; // pierwsze uruchomienie - nie ma o czym informować
  toast('Zaktualizowano do wersji ' + VERSION + '. Dotknij nazwy ZipRun, żeby zobaczyć zmiany.');
}

// ------------------------------------------------------------- lista planów

function renderPlans() {
  const list = $('plan-list');
  list.innerHTML = '';
  const pasuje = (p) => {
    if (levelFilter === 'all') return true;
    if (levelFilter === 'own') return !!p.custom;
    if (levelFilter === 'fav') return czyUlubiony(p.id);
    return String(p.level) === levelFilter;
  };
  // Ulubione idą na górę każdej listy — po to się je oznacza. Kolejność
  // wewnątrz grup zostaje bez zmian, żeby lista nie tasowała się przy każdym
  // wejściu.
  const visible = wszystkiePlany().filter(pasuje)
    .sort((a, b) => (czyUlubiony(b.id) ? 1 : 0) - (czyUlubiony(a.id) ? 1 : 0));
  if (!visible.length) {
    list.innerHTML = '<p class="hint">' + (levelFilter === 'fav'
      ? 'Nie masz jeszcze ulubionych planów. Otwórz dowolny plan i dotknij „☆ Ulubiony”.'
      : 'Nie masz jeszcze własnych planów. Ułóż pierwszy przyciskiem powyżej.') + '</p>';
    return;
  }

  for (const plan of visible) {
    const r = resolvePlan(plan, profile);
    const speeds = r.segments.map((s) => s.speed);
    const btn = document.createElement('button');
    btn.className = 'plan l' + plan.level;
    btn.innerHTML =
      '<div class="focus">' + plan.focus + '</div>' +
      '<h3>' + (czyUlubiony(plan.id) ? '<span class="fav">★</span>' : '') + plan.name +
        (plan.custom ? '<span class="own">mój</span>' : '') + '</h3>' +
      '<div class="row">' +
        '<span>' + Math.round(r.totalSeconds / 60) + ' min</span>' +
        '<span>~' + r.estDistanceKm.toFixed(1).replace('.', ',') + ' km</span>' +
        '<span>' + Math.min(...speeds).toFixed(1).replace('.', ',') + '–' +
          Math.max(...speeds).toFixed(1).replace('.', ',') + ' km/h</span>' +
      '</div>' +
      // Kształt treningu widać bez wchodzenia w szczegóły: równy bieg, fala,
      // serie. Ten sam wykres co w szczegółach planu, tylko niski — dlatego
      // rysuje go ta sama funkcja, a nie druga, która mogłaby się rozjechać.
      '<div class="chart mini">' + chartHtml(r.segments, Math.max(...speeds, 1)) + '</div>';
    btn.addEventListener('click', () => openPlan(plan.id));
    list.appendChild(btn);
  }
}

els('#plan-filters .chip').forEach((c) =>
  c.addEventListener('click', () => {
    els('#plan-filters .chip').forEach((x) => x.classList.remove('active'));
    c.classList.add('active');
    levelFilter = c.dataset.level;
    renderPlans();
  })
);

// ------------------------------------------------------------------ kreator

const kreator = { typ: 'fat', minuty: 30, intensywnosc: 'srednia' };
let podgladPlanu = null;

function budujKreator() {
  $('kr-typy').innerHTML = TYPY
    .map((t) => '<button class="chip" data-typ="' + t.id + '">' + t.nazwa + '</button>').join('');
  $('kr-intensywnosc').innerHTML = INTENSYWNOSCI
    .map((i) => '<button class="chip" data-int="' + i.id + '">' + i.nazwa + '</button>').join('');
  els('#kr-typy .chip').forEach((b) =>
    b.addEventListener('click', () => { kreator.typ = b.dataset.typ; odswiezKreator(); }));
  els('#kr-intensywnosc .chip').forEach((b) =>
    b.addEventListener('click', () => { kreator.intensywnosc = b.dataset.int; odswiezKreator(); }));
  const suwak = $('kr-czas');
  suwak.min = MIN_MINUT;
  suwak.max = MAX_MINUT;
  suwak.value = kreator.minuty;
  suwak.addEventListener('input', () => { kreator.minuty = +suwak.value; odswiezKreator(); });
  $('kr-nazwa').addEventListener('input', odswiezKreator);
}

/**
 * Podgląd przelicza się przy każdej zmianie, bo inaczej trzeba by zgadywać,
 * co wyjdzie z wybranych ustawień. Plan powstaje ten sam, który potem zapisujemy.
 */
function odswiezKreator() {
  els('#kr-typy .chip').forEach((b) => b.classList.toggle('active', b.dataset.typ === kreator.typ));
  els('#kr-intensywnosc .chip').forEach((b) =>
    b.classList.toggle('active', b.dataset.int === kreator.intensywnosc));
  $('kr-czas').value = kreator.minuty;
  $('kr-czas-v').textContent = kreator.minuty + ' min';
  $('kr-opis').textContent = TYPY.find((t) => t.id === kreator.typ)?.opis || '';

  podgladPlanu = generujPlan({ ...kreator, nazwa: $('kr-nazwa').value });
  const r = resolvePlan(podgladPlanu, profile);
  const predkosci = r.segments.map((x) => x.speed);
  const pracaS = r.segments.filter((x) => x.kind === 'work').reduce((a, x) => a + x.duration, 0);
  $('kr-meta').innerHTML = [
    Math.round(r.totalSeconds / 60) + ' min',
    '~' + r.estDistanceKm.toFixed(2).replace('.', ',') + ' km',
    r.segments.length + ' ' + plural(r.segments.length, 'odcinek', 'odcinki', 'odcinków'),
    Math.round((pracaS / r.totalSeconds) * 100) + '% pracy',
    // Marsz ma jedną prędkość na cały trening — „5,0–5,0" wyglądałoby na usterkę.
    (() => {
      const lo = Math.min(...predkosci).toFixed(1).replace('.', ',');
      const hi = Math.max(...predkosci).toFixed(1).replace('.', ',');
      return (lo === hi ? lo : lo + '–' + hi) + ' km/h';
    })(),
  ].map((x) => '<span>' + x + '</span>').join('');
  $('kr-chart').innerHTML = chartHtml(r.segments, Math.max(...predkosci, 1));
  $('kr-segments').innerHTML = listaSegmentow(r.segments);
  // Nazwa domyślna jako podpowiedź, nie jako wpisana wartość — pusty formularz
  // zostaje pusty, a i tak widać, jak plan się będzie nazywał.
  $('kr-nazwa').placeholder = generujPlan(kreator).name;
}

$('btn-new-plan').addEventListener('click', () => goto('creator'));

$('btn-save-plan').addEventListener('click', () => {
  if (!podgladPlanu) return;
  wlasnePlany = store.savePlan(podgladPlanu);
  $('kr-nazwa').value = '';
  renderPlans();
  toast('Zapisano plan: ' + podgladPlanu.name);
  openPlan(podgladPlanu.id);
  odswiezKreator();
});

function odswiezPrzyciskUlubionych() {
  const b = $('btn-fav');
  const jest = !!selectedPlan && czyUlubiony(selectedPlan.id);
  b.setAttribute('aria-pressed', jest ? 'true' : 'false');
  b.textContent = jest ? '★ Ulubiony' : '☆ Ulubiony';
}

$('btn-fav').addEventListener('click', () => {
  if (!selectedPlan) return;
  ulubione = store.toggleFavourite(selectedPlan.id);
  odswiezPrzyciskUlubionych();
  renderPlans();
  toast(czyUlubiony(selectedPlan.id)
    ? 'Dodano do ulubionych.'
    : 'Usunięto z ulubionych.');
});

$('btn-delete-plan').addEventListener('click', () => {
  const plan = selectedPlan;
  if (!plan?.custom) return;
  const pytanie = 'Usunąć plan „' + plan.name + '”?\n\n' +
    'Historia odbytych treningów zostaje nietknięta.';
  if (!confirm(pytanie)) return;
  wlasnePlany = store.deletePlan(plan.id);
  ulubione = store.loadFavourites();
  selectedPlan = null;
  renderPlans();
  goto('plans');
  toast('Plan usunięty.');
});

// --------------------------------------------------------- szczegóły planu

function listaSegmentow(segments) {
  return segments
    .map((s) => {
      const inc = s.incline > 0 ? ' · ' + s.incline + '%'
                : s.wantedIncline > 0 ? ' · <s>' + s.wantedIncline + '%</s>'
                : '';
      return '<div class="seg ' + s.kind + '"><i></i>' +
      '<div class="nm">' + s.label + inc + '</div>' +
      '<div class="sp">' + s.speed.toFixed(1).replace('.', ',') + '</div>' +
      '<div class="tm">' + fmtTime(s.duration) + '</div></div>';
    })
    .join('');
}

function chartHtml(segments, maxSpeed) {
  // Szerokość słupka proporcjonalna do czasu, wysokość do prędkości.
  const total = segments.reduce((a, s) => a + s.duration, 0);
  return segments
    .map((s) => {
      const h = Math.max(4, Math.round((s.speed / maxSpeed) * 100));
      const w = Math.max(0.4, (s.duration / total) * 100);
      return '<div class="bar ' + s.kind + '" style="height:' + h + '%;flex:0 0 ' + w + '%" ' +
             'title="' + s.label + ' — ' + s.speed + ' km/h"></div>';
    })
    .join('');
}

/**
 * Ostrzeżenia zależą od tego, co bieżnia potrafi TERAZ, a nie od tego, co
 * potrafiła w chwili otwarcia planu. Bez osobnej funkcji, wołanej też po
 * połączeniu, na ekranie zostawał napis „Bieżnia nie jest połączona"
 * mimo połączonej bieżni — widać to na zrzucie z 22 września.
 */
function odswiezOstrzezenia() {
  const plan = selectedPlan;
  if (!plan) return;
  const notes = [];
  if (plan.manual) notes.push('Ten plan nie ustawia prędkości automatycznie — tempo dobierasz sam.');
  if (!tm.connected) notes.push('Bieżnia nie jest połączona. Możesz uruchomić trening w trybie prowadzenia, ale bez automatycznego sterowania.');
  else if (!tm.caps.speed) notes.push('Ta bieżnia nie przyjmuje komend prędkości — dostaniesz tylko zapowiedzi, co ustawić.');

  // Porównujemy z nachyleniem ZAŁOŻONYM w planie, nie z już przyciętym do zera —
  // inaczej ostrzeżenie nigdy by się nie pokazało.
  const maxWanted = Math.max(0, ...plan.segments.map((s) => s.wantedIncline || 0));
  if (maxWanted > profile.maxInclineCap) {
    notes.push(
      'Plan zakłada nachylenie do ' + maxWanted + '%, a Twoja bieżnia nie ma sterowanej pochylni — ' +
      'odcinki pod górę pobiegniesz płasko. Wysiłek będzie zauważalnie mniejszy niż zakładany.'
    );
  }

  // Górne kotwice zlewają się w jedno, gdy plan żąda więcej, niż bieżnia potrafi.
  const capped = plan.segments.filter((s) => s.speed >= profile.maxSpeedCap).length;
  if (capped > 2 && tm.connected) {
    notes.push('Część odcinków została przycięta do maksymalnej prędkości bieżni (' +
               profile.maxSpeedCap + ' km/h).');
  }
  const warn = $('pd-warning');
  warn.innerHTML = notes.join('<br>');
  warn.classList.toggle('hidden', notes.length === 0);
}

function openPlan(id) {
  const plan = znajdzPlan(id);
  selectedPlan = resolvePlan(plan, profile);
  const r = selectedPlan;

  $('pd-name').textContent = plan.name;
  $('pd-meta').innerHTML =
    '<span>' + plan.focus + '</span>' +
    '<span>' + Math.round(r.totalSeconds / 60) + ' min</span>' +
    '<span>~' + r.estDistanceKm.toFixed(2).replace('.', ',') + ' km</span>' +
    '<span>poziom ' + plan.level + '/3</span>';
  $('pd-desc').textContent = plan.desc;

  const maxSpeed = Math.max(...r.segments.map((s) => s.speed), 1);
  $('pd-chart').innerHTML = chartHtml(r.segments, maxSpeed);

  $('pd-segments').innerHTML = listaSegmentow(r.segments);

  odswiezOstrzezenia();

  // Usunąć można tylko własny plan — wbudowanych nie ma jak odtworzyć.
  $('btn-delete-plan').classList.toggle('hidden', !plan.custom);
  odswiezPrzyciskUlubionych();

  goto('plan');
}

$('btn-start').addEventListener('click', async () => {
  if (!selectedPlan) return;
  const plan = znajdzPlan(selectedPlan.id);
  const rozpisany = engine.load(plan, profile);
  zbudujPierscienOdcinkow(rozpisany);
  // Komunikat z poprzedniego treningu zostawał na ekranie i wyglądał jak
  // informacja o bieżącym — „Trening zatrzymany." tuż po starcie nowego.
  clearTimeout(msgTimer);
  $('run-msg').textContent = '';
  runSaved = false;
  engine.autoControl = settings.autoControl && !plan.manual && tm.caps.speed;
  engine.followManual = settings.followManual;
  trace.start({
    wersja: 'ZipRun ' + VERSION,
    plan: plan.name,
    urządzenie: tm.device?.name || '(niepołączone)',
    protokół: tm.driver?.name || '-',
    sterowanie: engine.autoControl ? 'automatyczne' : 'tryb prowadzenia',
    profil: 'swobodnie ' + profile.easy + ', szybko ' + profile.fast +
            ', limit ' + profile.maxSpeedCap + ' km/h',
  });
  // Informacja o trybie prowadzenia raz, na starcie - jako stały napis na
  // ekranie tylko zaśmiecała widok przez cały trening.
  if (!engine.autoControl) toast('Tryb prowadzenia — prędkość ustawiasz sam na bieżni.');
  if (settings.keepAwake) keeper.acquire();
  speech.beep(660, 90); // odblokowuje audio przy pierwszym gescie
  goto('run');
  try { await engine.start(settings.countdown); }
  catch (e) { toast(e.message, true); }
});

// ------------------------------------------------------------ ekran treningu

// Obwody obu pierścieni: 2*pi*80 (wewnętrzny) i 2*pi*95 (zewnętrzny).
// Ile sekund przed zmianą prędkości środek pierścienia przechodzi
// w odliczanie. Dziesięć sekund to już zapowiedź głosowa, trzy byłoby za
// późno, żeby się przygotować.
const ODLICZANIE_S = 5;

const RING = 502.65;
const RING_TOTAL = 596.90;
const PROMIEN_ZEWN = 95;
// Przerwa między łukami odcinków, w jednostkach obwodu. Przy bardzo krótkich
// odcinkach łuk zostaje mimo to widoczny — patrz Math.max niżej.
const PRZERWA_LUKU = 3;

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

/**
 * Bieżnia bez sterowanej pochylni pokazywałaby stałe zero i miała dwa martwe
 * przyciski — chowamy je i oddajemy miejsce przyciskowi zmiany odcinka.
 */
function updateInclineUi() {
  const has = profile.maxInclineCap > 0;
  $('tile-incline').classList.toggle('hidden', !has);
  $('tile-avg').classList.toggle('hidden', has);
  $('c-inc-up').classList.toggle('hidden', !has);
  $('c-inc-down').classList.toggle('hidden', !has);
  el('.controls').classList.toggle('no-incline', !has);
  $('p-inc').closest('.field').classList.toggle('hidden', !has && tm.connected);
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
    ? 'Dalej: <b>' + nadchodzi.label + '</b> · ' +
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
  lastSummary = sum;
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

let msgTimer;
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

function applyRunMode() {
  const compact = settings.compact;
  $('view-run').classList.toggle('compact', compact);
  const btn = $('btn-mode');
  btn.innerHTML = compact ? IKONA_PELNY : IKONA_KOMPAKT;
  btn.title = compact ? 'Pełny panel ze sterowaniem' : 'Tryb kompaktowy';
  btn.setAttribute('aria-label', btn.title);
  const sw = $('s-compact');
  if (sw) sw.checked = compact;
}

$('btn-mode').addEventListener('click', () => {
  settings.compact = !settings.compact;
  store.saveSettings(settings);
  applyRunMode();
  toast(settings.compact ? 'Tryb kompaktowy' : 'Pełny panel ze sterowaniem');
});

// ------------------------------------------------------------ podsumowanie

/**
 * Półgodzinny trening daje ponad trzysta próbek, a w karcie mieści się około
 * stu dwudziestu słupków — flexbox nie ściśnie ich poniżej piksela, więc bez
 * uśrednienia wykres wylewał się poza ekran. Kubełkujemy do stałej liczby
 * słupków, zachowując kształt przebiegu.
 */
export function downsample(values, maxBars = 120) {
  if (values.length <= maxBars) return values;
  const size = values.length / maxBars;
  return Array.from({ length: maxBars }, (_, i) => {
    const from = Math.floor(i * size);
    const to = Math.max(from + 1, Math.floor((i + 1) * size));
    const bucket = values.slice(from, to).filter((v) => v != null);
    return bucket.length ? bucket.reduce((a, b) => a + b, 0) / bucket.length : 0;
  });
}

function showSummary(s) {
  $('sum-title').textContent = s.completed ? 'Trening ukończony' : 'Trening przerwany';
  $('sum-plan').textContent = s.planName + ' · ' + new Date(s.date).toLocaleString('pl-PL');
  $('sum-tiles').innerHTML = [
    ['tv', fmtTime(s.durationS), 'czas'],
    ['tv', s.distanceKm.toFixed(2).replace('.', ','), 'km'],
    ['tv', String(s.kcal), 'kcal'],
    ['tv', s.avgSpeed.toFixed(1).replace('.', ','), 'średnia km/h'],
    ...(s.avgHr ? [['tv', String(s.avgHr), 'średni puls'], ['tv', String(s.maxHr), 'maks. puls']] : []),
  ].map(([, v, l]) => '<div class="tile"><div class="tv">' + v + '</div><div class="tl">' + l + '</div></div>').join('');

  const values = downsample(s.samples.map((x) => x.actual ?? x.target ?? 0));
  const max = Math.max(...values, 1);
  $('sum-chart').innerHTML = values
    .map((v) => '<div class="bar" style="height:' + Math.max(3, (v / max) * 100) + '%"></div>')
    .join('');

  const extra = $('sum-extra');
  if (s.planId === 'test-cooper') {
    const vo2 = cooperVo2(s.distanceKm * 1000);
    extra.innerHTML = '<div class="card"><div class="card-title">Wynik testu</div>' +
      '<div class="kv">Dystans testowy: <b>' + Math.round(s.distanceKm * 1000) + ' m</b><br>' +
      'Szacowany VO2max: <b>' + vo2 + ' ml/kg/min</b><br>' +
      '<span class="hint">Uwaga: dystans obejmuje cały trening, nie tylko 12-minutowy odcinek testowy — ' +
      'odejmij rozgrzewkę i schłodzenie, jeśli chcesz dokładny wynik.</span></div></div>';
  } else extra.innerHTML = '';

  goto('summary');
}

// ---------------------------------------------------------------- historia

/** Polska odmiana: 1 trening, 2-4 treningi, 5+ treningów. */
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (n === 1) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function renderHistory() {
  const h = store.loadHistory();
  const st = store.historyStats(h);
  $('hist-stats').innerHTML = [
    [st.count, plural(st.count, 'trening', 'treningi', 'treningów')],
    [st.totalKm.toFixed(1).replace('.', ',') + ' km', 'łącznie'],
    [fmtTime(st.totalSec), 'w ruchu'],
    [st.weekKm.toFixed(1).replace('.', ',') + ' km', 'ostatnie 7 dni'],
  ].map(([v, l]) => '<div class="tile"><div class="tv">' + v + '</div><div class="tl">' + l + '</div></div>').join('');

  $('hist-list').innerHTML = h.length
    ? h.map((x, i) => wpisHistorii(x, h, i)).join('')
    : '<p class="hint">Brak zapisanych treningów.</p>';

  // Szczegóły rozwijają się dopiero po dotknięciu — lista ma zostać listą.
  els('#hist-list .hist').forEach((row) =>
    row.addEventListener('click', () => row.classList.toggle('open'))
  );
  renderTraces();
}

const liczba = (v, miejsc = 2) => v.toFixed(miejsc).replace('.', ',');

/** Tempo w min/km — dla biegacza czytelniejsze niż km/h. */
function tempoZPredkosci(kmh) {
  if (!kmh || kmh < 0.5) return null;
  const min = 60 / kmh;
  return Math.floor(min) + ':' + String(Math.round((min - Math.floor(min)) * 60)).padStart(2, '0');
}

/** Miniaturowy przebieg prędkości. Próbki mamy tylko dla ostatnich treningów. */
function iskierka(samples) {
  if (!samples || samples.length < 3) return '';
  const wart = downsample(samples.map((s) => s.actual ?? s.target ?? 0), 60);
  const max = Math.max(...wart, 1);
  return '<div class="spark">' +
    wart.map((v) => '<i style="height:' + Math.max(6, (v / max) * 100) + '%"></i>').join('') +
    '</div>';
}

function wpisHistorii(x, wszystkie, idx) {
  const km = x.distanceKm || 0;
  const czas = x.durationS || 0;
  const data = new Date(x.date);
  const tempo = tempoZPredkosci(x.avgSpeed);

  // Ile z planu udało się przejść, gdy trening został przerwany.
  let postep = '';
  if (!x.completed && x.plannedS) {
    postep = ' · ' + Math.round((czas / x.plannedS) * 100) + '% planu';
  }

  const fakty = [];
  if (x.avgSpeed) fakty.push(['średnia', liczba(x.avgSpeed, 1) + ' km/h']);
  if (tempo) fakty.push(['tempo', tempo + ' min/km']);
  if (x.maxSpeed) fakty.push(['maksimum', liczba(x.maxSpeed, 1) + ' km/h']);
  if (x.kcal) fakty.push(['kalorie', x.kcal + ' kcal']);
  if (x.avgHr) fakty.push(['tętno śr.', x.avgHr + ' bpm']);
  if (x.maxHr) fakty.push(['tętno maks.', x.maxHr + ' bpm']);
  if (x.segmentCount) fakty.push(['odcinki', (x.segmentsDone ?? '?') + ' z ' + x.segmentCount]);
  if (x.speedOffset) {
    fakty.push(['korekta', (x.speedOffset > 0 ? '+' : '') + liczba(x.speedOffset, 1) + ' km/h']);
  }
  if (x.speedFactor && Math.round((x.speedFactor - 1) * 100) !== 0) {
    const p = Math.round((x.speedFactor - 1) * 100);
    fakty.push(['z panelu', (p > 0 ? '+' : '') + p + '% planu']);
  }
  if (x.auto === false) fakty.push(['sterowanie', 'ręczne']);
  if (x.device) fakty.push(['bieżnia', x.device]);

  // Porównanie z poprzednim biegiem tego samego planu — najciekawsza
  // informacja w całej historii, bo pokazuje kierunek, a nie tylko stan.
  let porownanie = '';
  const poprzedni = wszystkie.slice(idx + 1).find((p) => p.planId === x.planId && p.completed);
  if (poprzedni && x.completed) {
    const dKm = km - (poprzedni.distanceKm || 0);
    const znak = dKm >= 0 ? '+' : '−';
    porownanie =
      '<div class="hist-cmp">Poprzednio ten plan: <b>' + liczba(poprzedni.distanceKm || 0) + ' km</b> ' +
      new Date(poprzedni.date).toLocaleDateString('pl-PL') +
      ' · teraz <b class="' + (dKm >= 0 ? 'lepiej' : 'gorzej') + '">' + znak + liczba(Math.abs(dKm)) + ' km</b></div>';
  }

  return (
    '<div class="hist' + (x.completed ? '' : ' dnf') + '">' +
      '<div class="hist-top">' +
        '<div><div class="nm">' + (x.planName || '—') + '</div>' +
        '<div class="dt">' + data.toLocaleString('pl-PL') +
        (x.completed ? '' : ' · przerwany' + postep) + '</div></div>' +
        '<div class="st"><div>' + liczba(km) + ' km</div>' +
        '<div class="dt">' + fmtTime(czas) + '</div></div>' +
      '</div>' +
      '<div class="hist-det">' +
        iskierka(x.samples) +
        '<div class="hist-facts">' +
          fakty.map(([k, v]) => '<div><span>' + k + '</span><b>' + v + '</b></div>').join('') +
        '</div>' +
        porownanie +
      '</div>' +
    '</div>'
  );
}

function renderTraces() {
  const list = store.loadTraces();
  const box = $('trace-list');
  if (!list.length) {
    box.innerHTML = '<p class="hint">Brak zapisów — pojawią się po pierwszym treningu.</p>';
    return;
  }
  box.innerHTML = list
    .map((t, i) =>
      '<button class="trace" data-trace="' + i + '">' +
      '<span class="nm">' + (t.planName || '—') + (t.completed ? '' : ' · przerwany') + '</span>' +
      '<span class="dt">' + new Date(t.date).toLocaleString('pl-PL') + ' · ' +
      (t.data?.metrics?.length || 0) + ' pomiarów, ' + (t.data?.events?.length || 0) + ' zdarzeń</span>' +
      '<span class="dl">Zapisz ↓</span></button>'
    )
    .join('');
  els('#trace-list [data-trace]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = store.loadTraces()[+b.dataset.trace];
      if (!t) return;
      downloadText('ziprun-trening-' + stamp(t.date) + '.txt', Trace.fromStored(t.data).toText());
      toast('Zapis pobrany.');
    })
  );
}

$('btn-export-trace').addEventListener('click', async (e) => {
  if (!trace.metrics.length && !trace.events.length) return toast('Brak zapisu do wyeksportowania.', true);
  // Rejestrator dopisuje jeszcze przez kilka sekund po komendzie zatrzymania,
  // bo pas hamuje. Dotknięcie przycisku w tym czasie dawało plik urwany
  // w połowie hamowania, bez potwierdzenia, że bieżnia w ogóle stanęła —
  // widać to w zapisie z 19 września, który kończy się na 1,7 km/h.
  const przycisk = e.currentTarget;
  if (trace.recording) {
    const napis = przycisk.textContent;
    przycisk.disabled = true;
    przycisk.textContent = 'Czekam, aż pas stanie…';
    await poczekajNaKoniecZapisu(trace);
    przycisk.disabled = false;
    przycisk.textContent = napis;
  }
  downloadText(
    'ziprun-trening-' + stamp(lastSummary?.date) + '.txt',
    trace.toText({ wynik: opisWyniku(lastSummary) })
  );
  toast('Zapis techniczny pobrany.');
});

$('btn-clear-history').addEventListener('click', () => {
  if (!confirm('Usunąć całą historię treningów wraz z zapisami technicznymi?')) return;
  store.clearHistory();
  store.clearTraces();
  renderHistory();
  toast('Historia wyczyszczona.');
});

// ------------------------------------------------------------------ profil

function renderProfile() {
  const set = (id, val) => { $(id).value = val; };
  set('p-easy', profile.easy); $('p-easy-v').textContent = profile.easy.toFixed(1).replace('.', ',') + ' km/h';
  set('p-fast', profile.fast); $('p-fast-v').textContent = profile.fast.toFixed(1).replace('.', ',') + ' km/h';
  set('p-walk', profile.walk); $('p-walk-v').textContent = profile.walk.toFixed(1).replace('.', ',') + ' km/h';
  set('p-cap', profile.maxSpeedCap); $('p-cap-v').textContent = profile.maxSpeedCap.toFixed(1).replace('.', ',') + ' km/h';
  set('p-inc', profile.maxInclineCap); $('p-inc-v').textContent = profile.maxInclineCap + ' %';
  $('s-compact').checked = settings.compact;
  $('s-voice').checked = settings.voice;
  $('s-auto').checked = settings.autoControl;
  $('s-follow').checked = settings.followManual;
  $('s-awake').checked = settings.keepAwake;
  $('s-countdown').value = settings.countdown;
  $('s-countdown-v').textContent = settings.countdown + ' s';

  const names = {
    walk: 'marsz', brisk: 'szybki marsz', jog: 'trucht', easy: 'swobodnie',
    steady: 'żywo', tempo: 'tempo', threshold: 'próg', vo2: 'VO2max', sprint: 'sprint',
  };
  $('anchors').innerHTML = Object.entries(names)
    .map(([k, label]) =>
      '<div><b>' + anchorSpeed(k, profile).toFixed(1).replace('.', ',') + '</b>' + label + '</div>')
    .join('');
}

function bindRange(id, key, fmt, isInt = false) {
  $(id).addEventListener('input', (e) => {
    const v = isInt ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
    profile[key] = v;
    // Tempo szybkie nie może być niższe od swobodnego — plan straciłby sens.
    if (key === 'easy' && profile.fast <= v) profile.fast = Math.round((v + 1) * 10) / 10;
    if (key === 'fast' && v <= profile.easy) profile.easy = Math.round((v - 1) * 10) / 10;
    store.saveProfile(profile);
    renderProfile();
    renderPlans();
  });
}

bindRange('p-easy', 'easy');
bindRange('p-fast', 'fast');
bindRange('p-walk', 'walk');
bindRange('p-cap', 'maxSpeedCap');
bindRange('p-inc', 'maxInclineCap', null, true);

const bindSwitch = (id, key, after) => $(id).addEventListener('change', (e) => {
  settings[key] = e.target.checked;
  store.saveSettings(settings);
  after?.(e.target.checked);
});
bindSwitch('s-compact', 'compact', applyRunMode);
bindSwitch('s-voice', 'voice', (v) => { speech.enabled = v; if (v) speech.say('Zapowiedzi włączone'); });
bindSwitch('s-auto', 'autoControl');
bindSwitch('s-follow', 'followManual');
bindSwitch('s-awake', 'keepAwake');
$('s-countdown').addEventListener('input', (e) => {
  settings.countdown = parseInt(e.target.value, 10);
  $('s-countdown-v').textContent = settings.countdown + ' s';
  store.saveSettings(settings);
});
/**
 * Awaryjne odświeżenie aplikacji. Czyści rejestracje service workera i pamięć
 * podręczną, ale nie dotyka localStorage — profil, historia i zapisy
 * techniczne zostają.
 */
async function pobierzOdNowa() {
  try {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  } catch (e) {
    toast('Nie udało się wyczyścić pamięci: ' + e.message, true);
    return;
  }
  location.reload();
}

// --------------------------------------------------------- kopia danych

$('btn-export-data').addEventListener('click', () => {
  const dane = store.eksportDanych();
  downloadText(
    'ziprun-kopia-' + stamp() + '.json',
    JSON.stringify(dane, null, 2)
  );
  toast('Zapisano kopię: ' + dane.historia.length + ' ' +
        plural(dane.historia.length, 'trening', 'treningi', 'treningów') + '.');
});

$('btn-import-data').addEventListener('click', () => $('import-file').click());

$('import-file').addEventListener('change', async (e) => {
  const plik = e.target.files?.[0];
  // Reset pola, żeby dało się wczytać ten sam plik drugi raz.
  e.target.value = '';
  if (!plik) return;

  let dane;
  try {
    dane = JSON.parse(await plik.text());
  } catch {
    toast('Nie udało się odczytać pliku — to nie jest poprawny JSON.', true);
    return;
  }
  if (!store.czyPoprawnaKopia(dane)) {
    toast('To nie wygląda na kopię danych ZipRun.', true);
    return;
  }

  const kiedy = dane.utworzono ? new Date(dane.utworzono).toLocaleString('pl-PL') : 'nieznana data';
  const ile = dane.historia.length;
  if (!confirm(
    'Kopia z ' + kiedy + ' zawiera ' + ile + ' ' +
    plural(ile, 'trening', 'treningi', 'treningów') + '.\n\n' +
    'Treningi zostaną dopisane do obecnej historii; powtórki są pomijane.'
  )) return;

  // Profil i ustawienia to sprawa tego urządzenia, więc pytamy osobno —
  // nadpisania prędkości w profilu nie da się cofnąć.
  const zProfilem = confirm(
    'Wczytać też profil i ustawienia z kopii?\n\n' +
    'Zastąpią obecne — tego nie da się cofnąć.\n' +
    'Anuluj, żeby zaimportować wyłącznie treningi.'
  );

  try {
    const w = store.importujDane(dane, { zProfilem });
    if (zProfilem) { profile = store.loadProfile(); settings = store.loadSettings(); }
    wlasnePlany = store.loadPlans();
    ulubione = store.loadFavourites();
    speech.enabled = settings.voice;
    renderProfile();
    renderPlans();
    updateInclineUi();
    applyRunMode();
    renderHistory();
    toast('Dodano ' + w.dodane + ' z ' + w.wPliku + ' ' +
          plural(w.wPliku, 'treningu', 'treningów', 'treningów') +
          (w.pominiete ? ' (pominięto powtórek: ' + w.pominiete + ')' : '') + '.' +
          (w.planowDodanych ? ' Dołożono też ' + w.planowDodanych + ' ' +
            plural(w.planowDodanych, 'własny plan', 'własne plany', 'własnych planów') + '.' : ''));
  } catch (err) {
    toast('Import nieudany: ' + err.message, true);
  }
});

$('btn-force-update').addEventListener('click', () => {
  if (!confirm('Pobrać wszystkie pliki aplikacji od nowa?\n\nProfil, historia treningów i zapisy techniczne zostaną zachowane.')) return;
  pobierzOdNowa();
});

$('btn-test-voice').addEventListener('click', () => {
  speech.beep();
  speech.say('Za dziesięć sekund: interwał cztery minuty, trzynaście kilometrów na godzinę.', { priority: true });
  if (!speech.voice) toast('Brak polskiego głosu w systemie — doinstaluj go w ustawieniach Androida (Zamiana tekstu na mowę).');
});

// ------------------------------------------------------------------ sprzęt

function logLine(msg) {
  const box = $('log');
  const t = new Date().toLocaleTimeString('pl-PL');
  box.textContent += '[' + t + '] ' + msg + '\n';
  box.scrollTop = box.scrollHeight;
}

tm.on('log', (e) => logLine(e.msg));

tm.on('state', (e) => {
  const dot = $('conn-dot');
  dot.className = 'dot' + (e.state === 'connected' ? ' on' : e.state === 'connecting' ? ' wait' : '');
  if (e.state === 'connected') {
    $('btn-connect').textContent = tm.device?.name || 'Połączona';
    $('dev-status').innerHTML = 'Połączono z <b>' + (tm.device?.name || 'urządzeniem') + '</b><br>' +
      'Protokół: <b>' + e.driver + '</b>';
    renderCaps(e.caps);
    settings.lastDeviceName = tm.device?.name || '';
    store.saveSettings(settings);
    toast('Połączono: ' + (tm.device?.name || 'bieżnia'));
  } else if (e.state === 'disconnected') {
    $('btn-connect').textContent = 'Połącz bieżnię';
    $('dev-status').textContent = 'Rozłączono.';
    if (engine.state === STATE.RUNNING) {
      engine.pause('Utracono połączenie z bieżnią.');
      tm.reconnect().then((ok) => { if (ok) toast('Połączenie odzyskane — wznów trening.'); });
    }
  }
  // Ostrzeżenia na ekranie planu mówią o bieżni, więc muszą nadążać za nią,
  // a nie za chwilą, w której plan został otwarty.
  odswiezOstrzezenia();
});

function renderCaps(caps) {
  const yn = (v) => (v ? '<b>tak</b>' : 'nie');
  $('dev-caps').innerHTML =
    'Sterowanie prędkością: ' + yn(caps.speed) + '<br>' +
    'Sterowanie nachyleniem: ' + yn(caps.incline) + '<br>' +
    'Zakres prędkości: <b>' + caps.speedRange.min + '–' + caps.speedRange.max + ' km/h</b><br>' +
    'Zakres nachylenia: <b>' + caps.inclineRange.min + '–' + caps.inclineRange.max + ' %</b>' +
    (caps.unverified
      ? '<br><span style="color:var(--warn)">Protokół własnościowy — komendy sterujące nie są jeszcze potwierdzone. ' +
        'Uruchom diagnostykę i test sterowania.</span>'
      : '');
  // Limit z profilu nie powinien przekraczać tego, co bieżnia w ogóle potrafi.
  if (caps.speedRange.max && profile.maxSpeedCap > caps.speedRange.max) {
    profile.maxSpeedCap = caps.speedRange.max;
    store.saveProfile(profile);
  }
  if (caps.inclineRange.max != null && profile.maxInclineCap > caps.inclineRange.max) {
    profile.maxInclineCap = caps.inclineRange.max;
    store.saveProfile(profile);
  }
  updateInclineUi();
  renderPlans();
}

async function connectFlow() {
  try {
    await tm.pick();
    await tm.connect();
  } catch (e) {
    if (e.name === 'NotFoundError') toast('Nie wybrano urządzenia.');
    else toast('Błąd połączenia: ' + e.message, true);
    logLine('BŁĄD: ' + e.message);
  }
}

$('btn-connect').addEventListener('click', () => {
  if (tm.connected) goto('device'); else connectFlow();
});
$('btn-pick').addEventListener('click', connectFlow);
$('btn-disconnect').addEventListener('click', () => tm.disconnect());

$('btn-diag').addEventListener('click', async () => {
  if (!tm.connected) return toast('Najpierw połącz bieżnię.', true);
  $('btn-diag').textContent = 'Skanuję...';
  try {
    const { tree, info } = await tm.runDiagnostics();
    const infoLines = Object.entries(info).map(([k, v]) => k + ': ' + v).join('\n');
    $('diag-tree').textContent =
      (infoLines ? infoLines + '\n\n' : '') +
      tree.map((s) =>
        'USŁUGA ' + s.uuid + (KNOWN_NAMES[s.uuid] ? '  // ' + KNOWN_NAMES[s.uuid] : '') + '\n' +
        s.chars.map((c) =>
          '  ' + c.uuid.slice(4, 8) + ' [' + c.props + ']' +
          (c.name ? '  // ' + c.name : '') +
          (c.raw ? '\n     = ' + c.raw : '') +
          (c.text ? '\n     "' + c.text + '"' : '')
        ).join('\n')
      ).join('\n\n');
    toast('Diagnostyka gotowa. Pozmieniaj teraz prędkość na konsoli bieżni.');
  } catch (e) {
    toast('Diagnostyka nieudana: ' + e.message, true);
  } finally {
    $('btn-diag').textContent = 'Uruchom diagnostykę';
  }
});

tm.on('frame', (f) => logLine('<- ' + (f.char || f.uuid || '').slice(4, 8) + '  ' + f.hex));

/** Podaje tekst do zapisania jako plik. */
function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const stamp = (iso = new Date().toISOString()) => iso.slice(0, 19).replace(/[:T]/g, '-');

$('btn-export').addEventListener('click', () => {
  if (!tm.diagnostics) return toast('Najpierw uruchom diagnostykę.', true);
  const report = tm.diagnostics.toReport({
    'Wersja aplikacji': 'ZipRun ' + VERSION,
    'Urządzenie': tm.device?.name || '(bez nazwy)',
    'Sterownik': tm.driver?.name || '-',
    'Możliwości': JSON.stringify(tm.caps),
  });
  downloadText('ziprun-diagnostyka-' + stamp() + '.txt', report);
});

els('[data-test]').forEach((b) =>
  b.addEventListener('click', async () => {
    if (!tm.connected) return toast('Najpierw połącz bieżnię.', true);
    const map = {
      control: () => tm.driver.requestControl(),
      start: () => tm.start(),
      s3: () => tm.setSpeedNow(3),
      s6: () => tm.setSpeedNow(6),
      i2: () => tm.setIncline(2),
      stop: () => tm.stopBelt(),
    };
    try {
      await map[b.dataset.test]();
      logLine('Test "' + b.dataset.test + '": OK');
      toast('Komenda przyjęta.');
      if (tm.driver && 'confirmed' in tm.driver) {
        tm.driver.confirmed = true;
        renderCaps(tm.caps);
      }
    } catch (e) {
      logLine('Test "' + b.dataset.test + '": ' + e.message);
      toast('Odrzucone: ' + e.message, true);
    }
  })
);

$('btn-raw').addEventListener('click', async () => {
  const bytes = parseHex($('raw-hex').value);
  if (!bytes.length) return toast('Podaj bajty w hex.', true);
  try {
    if (tm.driver?.sendRaw) await tm.driver.sendRaw(bytes);
    else throw new Error('Ten sterownik nie obsługuje wysyłki surowych ramek.');
  } catch (e) { toast(e.message, true); }
});

$('btn-clear-log').addEventListener('click', () => { $('log').textContent = ''; });

// ------------------------------------------------------------------- start

/**
 * Gdyby pliki aplikacji pochodziły z różnych wydań, kod wywaliłby się dopiero
 * w trakcie treningu komunikatem o braku elementu — tak właśnie objawiła się
 * mieszanka 1.7.0 z 1.7.1. Lepiej wykryć to na starcie i od razu zaproponować
 * naprawę, zamiast zostawiać użytkownika z zagadkowym błędem.
 */
function sprawdzSpojnoscPlikow() {
  const wymagane = [
    'run-kind', 'run-label', 'run-segtime', 'run-speed', 'run-target', 'run-mini',
    'run-next', 'run-factor', 'kr-typy', 'kr-czas', 'kr-chart', 'btn-new-plan', 'btn-fav', 'btn-mode', 'btn-end', 'c-stop', 'c-pause', 'ring-fg', 'ring-segments',
  ];
  const brakuje = wymagane.filter((id) => !$(id));
  if (!brakuje.length) return;
  const ok = confirm(
    'Pliki aplikacji pochodzą z różnych wydań i trening mógłby się przez to ' +
    'wysypać.\n\nBrakuje: ' + brakuje.join(', ') +
    '\n\nPobrać je od nowa? Profil i historia treningów zostaną zachowane.'
  );
  if (ok) pobierzOdNowa();
}

// Wpis bazowy: bez niego pierwsze cofnięcie nie miałoby dokąd wrócić.
history.replaceState({ view: 'plans' }, '');

sprawdzSpojnoscPlikow();

if (!bleAvailable()) $('unsupported').classList.remove('hidden');
renderVersion();
applyRunMode();
budujKreator();
odswiezKreator();
renderPlans();
renderProfile();
updateInclineUi();
announceUpdate();
if (settings.lastDeviceName) $('btn-connect').textContent = 'Połącz: ' + settings.lastDeviceName;

// Ostrzeżenie przed zamknięciem karty w trakcie treningu — pas by dalej chodził.
window.addEventListener('beforeunload', (e) => {
  if (engine.state === STATE.RUNNING) { e.preventDefault(); e.returnValue = ''; }
});

if ('serviceWorker' in navigator) {
  // Numer wersji w adresie skryptu jest tu konieczny, nie ozdobny. Sam sw.js
  // nie zmienia się między wydaniami — zmienia się tylko importowany
  // js/version.js. Przeglądarka porównuje bajty sw.js, widziała identyczne
  // i nie wymieniała service workera, więc telefon zostawał na starej wersji.
  // Zmiana adresu gwarantuje wykrycie aktualizacji.
  //
  // updateViaCache 'none' dokłada drugie zabezpieczenie: bez tego importy są
  // przy sprawdzaniu brane z pamięci HTTP (domyślne 'imports'), a GitHub Pages
  // podaje max-age=600.
  navigator.serviceWorker
    .register('sw.js?v=' + VERSION, { type: 'module', updateViaCache: 'none' })
    .catch(() => { /* offline opcjonalny */ });
}
