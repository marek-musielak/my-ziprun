// Historia treningów i lista zapisów technicznych.

import { fmtTime } from '../plans.js';
import { Trace } from '../trace.js';
import * as store from '../storage.js';
import { $, els, toast, plural, esc, downloadText, stamp } from './core.js';
import { naWejscie } from './nav.js';
import { downsample } from './charts.js';

export function renderHistory() {
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

naWejscie('history', renderHistory);

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
        '<div><div class="nm">' + esc(x.planName || '—') + '</div>' +
        '<div class="dt">' + data.toLocaleString('pl-PL') +
        (x.completed ? '' : ' · przerwany' + postep) + '</div></div>' +
        '<div class="st"><div>' + liczba(km) + ' km</div>' +
        '<div class="dt">' + fmtTime(czas) + '</div></div>' +
      '</div>' +
      '<div class="hist-det">' +
        iskierka(x.samples) +
        '<div class="hist-facts">' +
          fakty.map(([k, v]) => '<div><span>' + k + '</span><b>' + esc(v) + '</b></div>').join('') +
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
      '<span class="nm">' + esc(t.planName || '—') + (t.completed ? '' : ' · przerwany') + '</span>' +
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

$('btn-clear-history').addEventListener('click', () => {
  if (!confirm('Usunąć całą historię treningów wraz z zapisami technicznymi?')) return;
  store.clearHistory();
  store.clearTraces();
  renderHistory();
  toast('Historia wyczyszczona.');
});
