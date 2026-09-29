// Lista planów, szczegóły planu, ulubione i start treningu.

import { resolvePlan } from '../plans.js';
import { VERSION } from '../version.js';
import * as store from '../storage.js';
import {
  $, els, tm, speech, keeper, engine, trace, stan,
  czyUlubiony, wszystkiePlany, znajdzPlan, toast,
} from './core.js';
import { goto } from './nav.js';
import { chartHtml, listaSegmentow } from './charts.js';
import { przygotujEkranTreningu } from './run.js';

let levelFilter = 'all';

// ------------------------------------------------------------- lista planów

export function renderPlans() {
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
    const r = resolvePlan(plan, stan.profile);
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

// ------------------------------------------------ ulubione i usuwanie planu

function odswiezPrzyciskUlubionych() {
  const b = $('btn-fav');
  const jest = !!stan.selectedPlan && czyUlubiony(stan.selectedPlan.id);
  b.setAttribute('aria-pressed', jest ? 'true' : 'false');
  b.textContent = jest ? '★ Ulubiony' : '☆ Ulubiony';
}

$('btn-fav').addEventListener('click', () => {
  if (!stan.selectedPlan) return;
  stan.ulubione = store.toggleFavourite(stan.selectedPlan.id);
  odswiezPrzyciskUlubionych();
  renderPlans();
  toast(czyUlubiony(stan.selectedPlan.id)
    ? 'Dodano do ulubionych.'
    : 'Usunięto z ulubionych.');
});

$('btn-delete-plan').addEventListener('click', () => {
  const plan = stan.selectedPlan;
  if (!plan?.custom) return;
  const pytanie = 'Usunąć plan „' + plan.name + '”?\n\n' +
    'Historia odbytych treningów zostaje nietknięta.';
  if (!confirm(pytanie)) return;
  stan.wlasnePlany = store.deletePlan(plan.id);
  stan.ulubione = store.loadFavourites();
  stan.selectedPlan = null;
  renderPlans();
  goto('plans');
  toast('Plan usunięty.');
});

// --------------------------------------------------------- szczegóły planu

/**
 * Ostrzeżenia zależą od tego, co bieżnia potrafi TERAZ, a nie od tego, co
 * potrafiła w chwili otwarcia planu. Bez osobnej funkcji, wołanej też po
 * połączeniu, na ekranie zostawał napis „Bieżnia nie jest połączona"
 * mimo połączonej bieżni — widać to na zrzucie z 22 września.
 */
export function odswiezOstrzezenia() {
  const plan = stan.selectedPlan;
  const profile = stan.profile;
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

export function openPlan(id) {
  const plan = znajdzPlan(id);
  stan.selectedPlan = resolvePlan(plan, stan.profile);
  const r = stan.selectedPlan;

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
  if (!stan.selectedPlan) return;
  const { profile, settings } = stan;
  const plan = znajdzPlan(stan.selectedPlan.id);
  const rozpisany = engine.load(plan, profile);
  przygotujEkranTreningu(rozpisany);
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
