// Wspólne zaplecze widoków: skróty do DOM, jedyne egzemplarze bieżni,
// silnika i rejestratora, stan dzielony między widokami i drobne narzędzia.

import { Treadmill } from '../ble/manager.js';
import { PLANS, planById, fmtTime } from '../plans.js';
import { WorkoutEngine, STATE } from '../engine.js';
import { Speech, ScreenKeeper } from '../speech.js';
import { Trace } from '../trace.js';
import * as store from '../storage.js';

export const $ = (id) => document.getElementById(id);
export const el = (sel) => document.querySelector(sel);
export const els = (sel) => [...document.querySelectorAll(sel)];

export const tm = new Treadmill();
export const speech = new Speech();
export const keeper = new ScreenKeeper();
export const engine = new WorkoutEngine(tm, speech);
// Rejestrator podłącza się do zdarzeń, które i tak są emitowane - nie ingeruje
// w silnik ani w warstwę BLE, więc nie może zepsuć samego treningu.
export const trace = new Trace().attach(tm, engine);

/**
 * Stan dzielony przez widoki. Jeden obiekt zamiast osobnych zmiennych, bo
 * zmienna zaimportowana z modułu jest tylko do odczytu — a profil wczytany
 * z kopii danych musi się podmienić wszędzie naraz.
 */
export const stan = {
  profile: store.loadProfile(),
  settings: store.loadSettings(),
  selectedPlan: null,
  podglad: null,          // plan z linku, oglądany przed dodaniem
  wlasnePlany: store.loadPlans(),
  ulubione: store.loadFavourites(),
  lastSummary: null,
};

speech.enabled = stan.settings.voice;

export const czyUlubiony = (id) => stan.ulubione.includes(id);

/** Plany własne na początku listy — to one są świeże i to ich się szuka. */
export const wszystkiePlany = () => [...stan.wlasnePlany, ...PLANS];
export const znajdzPlan = (id) => stan.wlasnePlany.find((p) => p.id === id) || planById(id);

/** Jedno zdanie o wyniku treningu — trafia do nagłówka zapisu technicznego. */
export const opisWyniku = (sum) => !sum ? '-' :
  fmtTime(sum.durationS) + ', ' + sum.distanceKm.toFixed(2) + ' km' +
  (sum.completed ? ', ukończony' : ', przerwany');

/** Czy trening trwa — wliczając pauzę i odliczanie przed startem. */
export const treningTrwa = () =>
  engine.state === STATE.RUNNING || engine.state === STATE.PAUSED || engine.state === STATE.COUNTDOWN;

let toastTimer;
export function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('err', isError);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

export { plural, esc } from '../tekst.js';

/** Podaje tekst do zapisania jako plik. */
export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export const stamp = (iso = new Date().toISOString()) => iso.slice(0, 19).replace(/[:T]/g, '-');

/**
 * Awaryjne odświeżenie aplikacji. Czyści rejestracje service workera i pamięć
 * podręczną, ale nie dotyka localStorage — profil, historia i zapisy
 * techniczne zostają.
 */
export async function pobierzOdNowa() {
  try {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  } catch (e) {
    toast('Nie udało się wyczyścić pamięci: ' + e.message, true);
    return;
  }
  location.reload();
}
