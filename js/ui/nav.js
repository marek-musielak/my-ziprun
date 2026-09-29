// Przełączanie widoków i gest wstecz.

import { $, els, stan, toast, treningTrwa } from './core.js';

let currentView = 'plans';
let prevView = 'plans';
// Ustawiane na czas obsługi gestu wstecz, żeby powrót nie dokładał kolejnego
// wpisu do historii — inaczej cofanie nigdy by z aplikacji nie wyszło.
let zHistorii = false;

// Widoki, które trzeba przeliczyć przy każdym wejściu, same się tu zapisują.
// Nawigacja nie importuje widoków, więc widoki mogą bez przeszkód importować
// nawigację.
const przyWejsciu = {};

/** Rejestruje funkcję odświeżającą widok przy każdym wejściu na niego. */
export function naWejscie(name, fn) { przyWejsciu[name] = fn; }

export const poprzedniWidok = () => prevView;

/**
 * Nie każdy widok da się pokazać w dowolnej chwili. Gest wstecz może trafić
 * w trening, którego już nie ma, albo w szczegóły planu po przeładowaniu
 * strony — wtedy zamiast pustego szkieletu pokazujemy listę planów.
 */
function dozwolonyWidok(name) {
  if (name === 'run' && !treningTrwa()) return 'plans';
  if (name === 'plan' && !stan.selectedPlan) return 'plans';
  return name;
}

export function goto(name) {
  if (name !== currentView) { prevView = currentView; currentView = name; }
  els('.view').forEach((v) => v.classList.remove('active'));
  $('view-' + name)?.classList.add('active');
  els('.tab').forEach((t) => t.classList.toggle('active', t.dataset.goto === name));
  window.scrollTo(0, 0);
  przyWejsciu[name]?.();

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
