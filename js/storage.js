// Profil, historia treningów i notatki o protokole - wszystko lokalnie
// w localStorage. Żadne dane nie wychodzą z telefonu.

import { DEFAULT_PROFILE } from './plans.js';
import { kotwicaRam } from './generator.js';

const KEY_PROFILE = 'ziprun.profile';
const KEY_HISTORY = 'ziprun.history';
const KEY_PROTO = 'ziprun.protocol';
const KEY_SETTINGS = 'ziprun.settings';

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch { return { ...fallback }; }
};

const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
};

export const loadProfile = () => read(KEY_PROFILE, DEFAULT_PROFILE);
export const saveProfile = (p) => write(KEY_PROFILE, p);

export const DEFAULT_SETTINGS = {
  voice: true,
  // Tryb kompaktowy jest domyslny: sterowanie odbywa sie z panelu biezni,
  // a ekran ma przede wszystkim informowac.
  compact: true,
  autoControl: true,
  // Zmiana prędkości z panelu bieżni przeskalowuje resztę planu. Domyślnie
  // włączone: skoro sterujesz z panelu, to panel ma ostatnie słowo.
  followManual: true,
  countdown: 5,
  keepAwake: true,
  lastDeviceName: '',
  seenVersion: '',
};

export const loadSettings = () => read(KEY_SETTINGS, DEFAULT_SETTINGS);
export const saveSettings = (s) => write(KEY_SETTINGS, s);

export function loadHistory() {
  try { return JSON.parse(localStorage.getItem(KEY_HISTORY) || '[]'); }
  catch { return []; }
}

export function addHistory(entry) {
  const h = loadHistory();
  // Próbki są potrzebne tylko dla ostatnich kilku treningów - inaczej
  // localStorage zapełni się w kilka tygodni.
  h.unshift(entry);
  const trimmed = h.slice(0, 200).map((e, i) => (i < 10 ? e : { ...e, samples: undefined }));
  write(KEY_HISTORY, trimmed);
  return trimmed;
}

export function clearHistory() { write(KEY_HISTORY, []); }

// --- ulubione -------------------------------------------------------------

const KEY_FAVS = 'ziprun.favourites';

/**
 * Same identyfikatory, nie kopie planów. Ulubiony plan wbudowany ma zostać
 * ulubiony także wtedy, gdy zmienią się jego odcinki w nowej wersji aplikacji.
 */
export function loadFavourites() {
  try {
    const l = JSON.parse(localStorage.getItem(KEY_FAVS) || '[]');
    return Array.isArray(l) ? l.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

export function toggleFavourite(id) {
  const lista = loadFavourites();
  const nowa = lista.includes(id) ? lista.filter((x) => x !== id) : [id, ...lista];
  write(KEY_FAVS, nowa);
  return nowa;
}

// --- plany własne ---------------------------------------------------------

const KEY_PLANS = 'ziprun.plans';
const MAX_PLANS = 50;

export function loadPlans() {
  try {
    const l = JSON.parse(localStorage.getItem(KEY_PLANS) || '[]');
    return Array.isArray(l) ? naprawRamy(naprawPrzerwy(l)) : [];
  } catch { return []; }
}

/**
 * Generator do wersji 1.12.0 oznaczał wolniejszy z dwóch biegów jako przerwę.
 * Ekran treningu pisał wtedy „Przerwa" w trakcie czterominutowego biegu.
 * Plan pamięta, z czego powstał, więc wiadomo, które przerwy były prawdziwe:
 * tylko interwały je mają. Poprawka jest jednorazowa i od razu się zapisuje.
 */
function naprawPrzerwy(lista) {
  let zmienione = false;
  const poprawione = lista.map((plan) => {
    if (!plan?.generator || plan.generator.typ === 'interwaly') return plan;
    if (!plan.segments?.some((x) => x.kind === 'recovery')) return plan;
    zmienione = true;
    return { ...plan, segments: plan.segments.map((x) =>
      (x.kind === 'recovery' ? { ...x, kind: 'work' } : x)) };
  });
  if (zmienione) write(KEY_PLANS, poprawione);
  return poprawione;
}

/** Zapisuje plan; ten sam identyfikator zastępuje poprzednią wersję. */
export function savePlan(plan) {
  const lista = [plan, ...loadPlans().filter((p) => p.id !== plan.id)].slice(0, MAX_PLANS);
  write(KEY_PLANS, lista);
  return lista;
}

export function deletePlan(id) {
  const lista = loadPlans().filter((p) => p.id !== id);
  write(KEY_PLANS, lista);
  // Bez tego po usunięciu planu zostawałby osierocony wpis w ulubionych,
  // a licznik ulubionych pokazywałby plan, którego nie ma.
  const ulubione = loadFavourites();
  if (ulubione.includes(id)) write(KEY_FAVS, ulubione.filter((x) => x !== id));
  return lista;
}

/**
 * Generator do wersji 1.15.3 dawał rozgrzewce i schłodzeniu zawsze tempo
 * marszu. W planie marszowym oznaczało to rozgrzewkę w tempie samego
 * treningu — sześć minut „rozgrzewki" w tempie, w którym potem szedł cały
 * trening. Plany zapisane wcześniej poprawiamy raz, przy wczytaniu;
 * odcinki właściwe zostają nietknięte.
 */
function naprawRamy(lista) {
  let zmienione = false;
  const poprawione = lista.map((plan) => {
    if (!plan?.generator || !Array.isArray(plan.segments) || plan.segments.length < 3) return plan;
    const s = plan.segments;
    if (s[0].kind !== 'warmup' || s[s.length - 1].kind !== 'cooldown') return plan;
    const powinno = kotwicaRam(s.slice(1, -1));
    if (s[0].s === powinno && s[s.length - 1].s === powinno) return plan;
    zmienione = true;
    return {
      ...plan,
      segments: s.map((x, i) =>
        (i === 0 || i === s.length - 1 ? { ...x, s: powinno } : x)),
    };
  });
  if (zmienione) write(KEY_PLANS, poprawione);
  return poprawione;
}

export const loadProtocol = () => read(KEY_PROTO, { driver: '', notes: '', templates: [] });
export const saveProtocol = (p) => write(KEY_PROTO, p);

// --- zapisy techniczne treningów ------------------------------------------

const KEY_TRACES = 'ziprun.traces';
const MAX_TRACES = 3;

export function loadTraces() {
  try { return JSON.parse(localStorage.getItem(KEY_TRACES) || '[]'); }
  catch { return []; }
}

/**
 * Trzymamy tylko trzy ostatnie zapisy. Jeden trening to kilkaset kilobajtów,
 * a localStorage ma około pięciu megabajtów na całą aplikację - bez tego
 * limitu historia treningów przestałaby się zapisywać po kilku tygodniach.
 * Gdy zapis się nie mieści, odrzucamy najstarsze i próbujemy ponownie.
 */
export function addTrace(entry) {
  let list = [entry, ...loadTraces()].slice(0, MAX_TRACES);
  while (list.length) {
    if (write(KEY_TRACES, list)) return list;
    list = list.slice(0, -1); // brak miejsca - rezygnujemy z najstarszego
  }
  write(KEY_TRACES, []);
  return [];
}

export function clearTraces() { write(KEY_TRACES, []); }

// --- kopia danych ---------------------------------------------------------

const FORMAT = 1;

/** Wszystko, co aplikacja trzyma lokalnie, w jednym obiekcie. */
export function eksportDanych() {
  return {
    aplikacja: 'ZipRun',
    wersjaFormatu: FORMAT,
    utworzono: new Date().toISOString(),
    profil: loadProfile(),
    ustawienia: loadSettings(),
    plany: loadPlans(),
    ulubione: loadFavourites(),
    historia: loadHistory(),
    zapisy: loadTraces(),
  };
}

export function czyPoprawnaKopia(obj) {
  return !!obj && obj.aplikacja === 'ZipRun' && Array.isArray(obj.historia);
}

/**
 * Scala kopię z tym, co już jest. Scalanie, a nie zastępowanie, bo import
 * z drugiego urządzenia nie powinien kasować treningów z tego. Powtórki
 * rozpoznajemy po dacie — jest to znacznik z dokładnością do milisekundy,
 * więc dwa różne treningi nie mogą go dzielić.
 */
export function importujDane(obj, { zProfilem = false } = {}) {
  if (!czyPoprawnaKopia(obj)) throw new Error('To nie jest kopia danych ZipRun.');

  const obecna = loadHistory();
  const znane = new Set(obecna.map((x) => x.date));
  const nowe = obj.historia.filter((x) => x && x.date && !znane.has(x.date));
  const scalona = [...obecna, ...nowe].sort((a, b) => new Date(b.date) - new Date(a.date));
  write(KEY_HISTORY, scalona.slice(0, 200).map((e, i) => (i < 10 ? e : { ...e, samples: undefined })));

  // Plany własne scalamy po identyfikatorze — tak samo jak treningi po dacie.
  // Ulubione scalamy, a nie zastępujemy — import z drugiego telefonu nie ma
  // prawa odznaczyć planów ulubionych na tym.
  let ulubionychDodanych = 0;
  if (Array.isArray(obj.ulubione) && obj.ulubione.length) {
    const obecneU = loadFavourites();
    const noweU = obj.ulubione.filter((x) => typeof x === 'string' && !obecneU.includes(x));
    ulubionychDodanych = noweU.length;
    if (noweU.length) write(KEY_FAVS, [...noweU, ...obecneU]);
  }

  let planowDodanych = 0;
  if (Array.isArray(obj.plany) && obj.plany.length) {
    const obecneP = loadPlans();
    const znaneP = new Set(obecneP.map((x) => x.id));
    const noweP = obj.plany.filter((x) => x && x.id && Array.isArray(x.segments) && !znaneP.has(x.id));
    planowDodanych = noweP.length;
    if (noweP.length) write(KEY_PLANS, [...noweP, ...obecneP].slice(0, MAX_PLANS));
  }

  let zapisowDodanych = 0;
  if (Array.isArray(obj.zapisy) && obj.zapisy.length) {
    const obecneZ = loadTraces();
    const znaneZ = new Set(obecneZ.map((x) => x.date));
    const noweZ = obj.zapisy.filter((x) => x && x.date && !znaneZ.has(x.date));
    zapisowDodanych = noweZ.length;
    const scaloneZ = [...obecneZ, ...noweZ].sort((a, b) => new Date(b.date) - new Date(a.date));
    // Ten sam limit co przy zapisie po treningu — trzy ostatnie.
    let lista = scaloneZ.slice(0, MAX_TRACES);
    while (lista.length && !write(KEY_TRACES, lista)) lista = lista.slice(0, -1);
  }

  if (zProfilem) {
    if (obj.profil) write(KEY_PROFILE, { ...DEFAULT_PROFILE, ...obj.profil });
    if (obj.ustawienia) write(KEY_SETTINGS, { ...DEFAULT_SETTINGS, ...obj.ustawienia });
  }

  return {
    wPliku: obj.historia.length,
    dodane: nowe.length,
    pominiete: obj.historia.length - nowe.length,
    zapisowDodanych,
    planowDodanych,
    ulubionychDodanych,
    profil: zProfilem,
  };
}

export function historyStats(h = loadHistory()) {
  const done = h.filter((x) => x.completed);
  const km = h.reduce((a, x) => a + (x.distanceKm || 0), 0);
  const sec = h.reduce((a, x) => a + (x.durationS || 0), 0);
  const kcal = h.reduce((a, x) => a + (x.kcal || 0), 0);
  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = h.filter((x) => new Date(x.date).getTime() > weekAgo);
  return {
    count: h.length,
    completed: done.length,
    totalKm: Math.round(km * 10) / 10,
    totalSec: sec,
    totalKcal: kcal,
    weekCount: thisWeek.length,
    weekKm: Math.round(thisWeek.reduce((a, x) => a + (x.distanceKm || 0), 0) * 10) / 10,
  };
}
