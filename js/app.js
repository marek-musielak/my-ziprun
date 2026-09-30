// Punkt wejścia: ładuje widoki, sprawdza spójność plików i uruchamia
// aplikację. Każdy widok mieszka we własnym module w js/ui/ i sam podpina
// się pod swoje przyciski w chwili importu.

import { bleAvailable } from './ble/manager.js';
import { VERSION } from './version.js';
import { STATE } from './engine.js';
import { $, engine, stan, pobierzOdNowa } from './ui/core.js';
import './ui/nav.js';
import { renderVersion, announceUpdate } from './ui/changelog.js';
import { renderPlans } from './ui/plan-list.js';
import { budujKreator, odswiezKreator } from './ui/creator.js';
import { updateInclineUi, applyRunMode } from './ui/run.js';
import './ui/summary.js';
import './ui/history.js';
import { renderProfile } from './ui/profile.js';
import './ui/device.js';
import { sprawdzLinkPlanu } from './ui/import.js';

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
    'btn-import-plan', 'p-limits', 'c-faster-krok', 'c-slower-krok', 'pd-legend', 'kr-legend', 'sum-date',
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
if (stan.settings.lastDeviceName) $('btn-connect').textContent = 'Połącz: ' + stan.settings.lastDeviceName;
// Po wpisie bazowym historii: gest wstecz z podglądu planu wraca do listy.
sprawdzLinkPlanu();

// Ostrzeżenie przed zamknięciem karty w trakcie treningu — pas by dalej chodził.
window.addEventListener('beforeunload', (e) => {
  if (engine.state === STATE.RUNNING || engine.state === STATE.COOLDOWN) { e.preventDefault(); e.returnValue = ''; }
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
