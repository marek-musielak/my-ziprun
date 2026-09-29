// Podsumowanie zakończonego treningu i pobranie jego zapisu technicznego.

import { fmtTime, cooperVo2 } from '../plans.js';
import { poczekajNaKoniecZapisu } from '../trace.js';
import { $, trace, stan, opisWyniku, toast, downloadText, stamp } from './core.js';
import { goto } from './nav.js';
import { downsample } from './charts.js';

export function showSummary(s) {
  $('sum-title').textContent = s.completed ? 'Trening ukończony' : 'Trening przerwany';
  $('sum-plan').textContent = s.planName + ' · ' + new Date(s.date).toLocaleString('pl-PL');
  // Przewyższenie tylko po treningu pod górę — na płaskim „0 m up" nic nie mówi.
  $('sum-tiles').innerHTML = [
    [fmtTime(s.durationS), 'czas'],
    [s.distanceKm.toFixed(2).replace('.', ','), 'km'],
    ...(s.przewyzszenieM > 0 ? [[String(s.przewyzszenieM), 'm up']] : []),
    [s.avgSpeed.toFixed(1).replace('.', ','), 'średnia km/h'],
    ...(s.avgHr ? [[String(s.avgHr), 'średni puls'], [String(s.maxHr), 'maks. puls']] : []),
  ].map(([v, l]) => '<div class="tile"><div class="tv">' + v + '</div><div class="tl">' + l + '</div></div>').join('');

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
    'ziprun-trening-' + stamp(stan.lastSummary?.date) + '.txt',
    trace.toText({ wynik: opisWyniku(stan.lastSummary) })
  );
  toast('Zapis techniczny pobrany.');
});
