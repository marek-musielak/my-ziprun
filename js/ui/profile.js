// Profil, ustawienia, kopia danych i narzędzia z sekcji „O aplikacji”.

import { anchorSpeed } from '../plans.js';
import * as store from '../storage.js';
import { $, speech, stan, toast, plural, downloadText, stamp, pobierzOdNowa } from './core.js';
import { naWejscie } from './nav.js';
import { renderPlans } from './plan-list.js';
import { updateInclineUi, applyRunMode } from './run.js';
import { renderHistory } from './history.js';

export function renderProfile() {
  const { profile, settings } = stan;
  const set = (id, val) => { $(id).value = val; };
  set('p-easy', profile.easy); $('p-easy-v').textContent = profile.easy.toFixed(1).replace('.', ',') + ' km/h';
  set('p-fast', profile.fast); $('p-fast-v').textContent = profile.fast.toFixed(1).replace('.', ',') + ' km/h';
  set('p-walk', profile.walk); $('p-walk-v').textContent = profile.walk.toFixed(1).replace('.', ',') + ' km/h';
  // Zakres tylko do odczytu: ustala go bieżnia przy połączeniu, a nie suwak.
  $('p-limits').innerHTML =
    'Prędkość: <b>do ' + profile.maxSpeedCap.toFixed(1).replace('.', ',') + ' km/h</b><br>' +
    'Nachylenie: <b>' + (profile.maxInclineCap > 0 ? 'do ' + profile.maxInclineCap + ' %' : 'brak pochylni') + '</b>';
  $('p-limits-src').textContent = profile.zakresZ
    ? 'Odczytany z bieżni ' + profile.zakresZ + '. Ani plan, ani korekta nie wyjdą poza ten zakres.'
    : 'Zakres nie był jeszcze odczytany z bieżni — ustawi się sam przy najbliższym połączeniu.';
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

naWejscie('profile', renderProfile);

function bindRange(id, key, fmt, isInt = false) {
  $(id).addEventListener('input', (e) => {
    const profile = stan.profile;
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

const bindSwitch = (id, key, after) => $(id).addEventListener('change', (e) => {
  stan.settings[key] = e.target.checked;
  store.saveSettings(stan.settings);
  after?.(e.target.checked);
});
bindSwitch('s-compact', 'compact', applyRunMode);
bindSwitch('s-voice', 'voice', (v) => { speech.enabled = v; if (v) speech.say('Zapowiedzi włączone'); });
bindSwitch('s-auto', 'autoControl');
bindSwitch('s-follow', 'followManual');
bindSwitch('s-awake', 'keepAwake');
$('s-countdown').addEventListener('input', (e) => {
  stan.settings.countdown = parseInt(e.target.value, 10);
  $('s-countdown-v').textContent = stan.settings.countdown + ' s';
  store.saveSettings(stan.settings);
});

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
    if (zProfilem) { stan.profile = store.loadProfile(); stan.settings = store.loadSettings(); }
    stan.wlasnePlany = store.loadPlans();
    stan.ulubione = store.loadFavourites();
    speech.enabled = stan.settings.voice;
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

// ------------------------------------------------------------ o aplikacji

$('btn-force-update').addEventListener('click', () => {
  if (!confirm('Pobrać wszystkie pliki aplikacji od nowa?\n\nProfil, historia treningów i zapisy techniczne zostaną zachowane.')) return;
  pobierzOdNowa();
});

$('btn-test-voice').addEventListener('click', () => {
  speech.beep();
  speech.say('Za dziesięć sekund: interwał cztery minuty, trzynaście kilometrów na godzinę.', { priority: true });
  if (!speech.voice) toast('Brak polskiego głosu w systemie — doinstaluj go w ustawieniach Androida (Zamiana tekstu na mowę).');
});
