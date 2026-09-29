// Kreator własnych planów z podglądem na żywo.

import { resolvePlan } from '../plans.js';
import { TYPY, INTENSYWNOSCI, MIN_MINUT, MAX_MINUT, generujPlan } from '../generator.js';
import * as store from '../storage.js';
import { $, els, stan, toast, plural } from './core.js';
import { goto, naWejscie } from './nav.js';
import { chartHtml, listaSegmentow } from './charts.js';
import { renderPlans, openPlan } from './plan-list.js';

const kreator = { typ: 'fat', minuty: 30, intensywnosc: 'srednia' };
let podgladPlanu = null;

export function budujKreator() {
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
export function odswiezKreator() {
  els('#kr-typy .chip').forEach((b) => b.classList.toggle('active', b.dataset.typ === kreator.typ));
  els('#kr-intensywnosc .chip').forEach((b) =>
    b.classList.toggle('active', b.dataset.int === kreator.intensywnosc));
  $('kr-czas').value = kreator.minuty;
  $('kr-czas-v').textContent = kreator.minuty + ' min';
  $('kr-opis').textContent = TYPY.find((t) => t.id === kreator.typ)?.opis || '';

  podgladPlanu = generujPlan({ ...kreator, nazwa: $('kr-nazwa').value });
  const r = resolvePlan(podgladPlanu, stan.profile);
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

naWejscie('creator', odswiezKreator);

$('btn-new-plan').addEventListener('click', () => goto('creator'));

$('btn-save-plan').addEventListener('click', () => {
  if (!podgladPlanu) return;
  stan.wlasnePlany = store.savePlan(podgladPlanu);
  $('kr-nazwa').value = '';
  renderPlans();
  toast('Zapisano plan: ' + podgladPlanu.name);
  openPlan(podgladPlanu.id);
  odswiezKreator();
});
