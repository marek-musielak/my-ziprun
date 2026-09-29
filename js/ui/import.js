// Plan z linku z edytora: `…/my-ziprun/#plan=…` otwiera jego podgląd.
// Nic nie jest zapisywane, dopóki nie dotkniesz „Dodaj do moich planów".

import { odkoduj, PREFIKS } from '../editor/link.js';
import { doPlanu } from '../editor/model.js';
import { toast } from './core.js';
import { pokazPodglad } from './plan-list.js';

/** Zwraca true, jeśli adres niósł plan i pokazano jego podgląd. */
export function sprawdzLinkPlanu() {
  if (!location.hash.startsWith(PREFIKS)) return false;
  const dane = location.hash.slice(PREFIKS.length);
  // Czyścimy adres od razu: przeładowanie strony nie ma pokazywać podglądu
  // drugi raz, a zakładka na ekranie głównym nie ma zapamiętać planu.
  history.replaceState(history.state, '', location.pathname + location.search);
  let plan;
  try {
    plan = doPlanu(odkoduj(dane));
  } catch (e) {
    toast(e.message, true);
    return false;
  }
  pokazPodglad(plan);
  return true;
}

// Link wklejony w pasek adresu otwartej już aplikacji nie przeładowuje strony.
window.addEventListener('hashchange', sprawdzLinkPlanu);
