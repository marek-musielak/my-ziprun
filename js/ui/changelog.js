// Numer wersji w nagłówku, historia zmian i powiadomienie po aktualizacji.

import { VERSION, CHANGELOG, currentEntry } from '../version.js';
import * as store from '../storage.js';
import { $, stan, toast } from './core.js';
import { goto, poprzedniWidok } from './nav.js';

export function renderVersion() {
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
$('cl-back').addEventListener('click', () => {
  const wstecz = poprzedniWidok();
  goto(wstecz === 'changelog' ? 'plans' : wstecz);
});

/**
 * Aplikacja aktualizuje się sama w tle, więc bez tego użytkownik nie miałby
 * skąd wiedzieć, że coś się zmieniło.
 */
export function announceUpdate() {
  const seen = stan.settings.seenVersion;
  if (seen === VERSION) return;
  stan.settings.seenVersion = VERSION;
  store.saveSettings(stan.settings);
  if (!seen) return; // pierwsze uruchomienie - nie ma o czym informować
  toast('Zaktualizowano do wersji ' + VERSION + '. Dotknij nazwy ZipRun, żeby zobaczyć zmiany.');
}
