// Pamięć telefonu: plany własne, ulubione, historia, kopia danych.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { instalujLocalStorage } from './helpers.mjs';

// storage.js sięga po localStorage dopiero przy wywołaniu, ale atrapa musi
// istnieć, zanim cokolwiek zostanie wczytane.
let ls = instalujLocalStorage();
const store = await import('../js/storage.js');
const { DEFAULT_PROFILE } = await import('../js/plans.js');
const { generujPlan } = await import('../js/generator.js');

beforeEach(() => ls.clear());

const plan = (nadpisz = {}) => ({ ...generujPlan({ typ: 'fat', intensywnosc: 'srednia', minuty: 30 }), ...nadpisz });
const trening = (date, extra = {}) => ({ date, planId: 'easy-30', planName: 'Rozbieganie', distanceKm: 3, durationS: 1800, completed: true, ...extra });

describe('profil i ustawienia', () => {
  test('bez zapisu dostajemy wartości domyślne', () => {
    assert.deepEqual(store.loadProfile(), DEFAULT_PROFILE);
    assert.deepEqual(store.loadSettings(), store.DEFAULT_SETTINGS);
  });

  test('zapisany profil wraca, brakujące pola uzupełniają wartości domyślne', () => {
    ls.setItem('ziprun.profile', JSON.stringify({ easy: 9 }));
    const p = store.loadProfile();
    assert.equal(p.easy, 9);
    assert.equal(p.fast, DEFAULT_PROFILE.fast);
  });

  test('uszkodzony zapis nie wywraca aplikacji', () => {
    ls.setItem('ziprun.profile', '{nie-json');
    assert.deepEqual(store.loadProfile(), DEFAULT_PROFILE);
  });

  test('wartość domyślna nie jest współdzielona z wynikiem', () => {
    const p = store.loadProfile();
    p.easy = 99;
    assert.equal(DEFAULT_PROFILE.easy, 8);
  });
});

describe('plany własne', () => {
  test('zapis i odczyt', () => {
    const p = plan();
    store.savePlan(p);
    assert.deepEqual(store.loadPlans().map((x) => x.id), [p.id]);
  });

  test('ten sam identyfikator zastępuje poprzednią wersję', () => {
    const p = plan();
    store.savePlan(p);
    store.savePlan({ ...p, name: 'Nowa nazwa' });
    const l = store.loadPlans();
    assert.equal(l.length, 1);
    assert.equal(l[0].name, 'Nowa nazwa');
  });

  test('najwyżej 50 planów, najnowszy na początku', () => {
    let ostatni;
    for (let i = 0; i < 55; i++) { ostatni = plan(); store.savePlan(ostatni); }
    const l = store.loadPlans();
    assert.equal(l.length, 50);
    assert.equal(l[0].id, ostatni.id);
  });

  test('usunięcie planu czyści też jego wpis w ulubionych', () => {
    const p = plan();
    store.savePlan(p);
    store.toggleFavourite(p.id);
    store.toggleFavourite('easy-30');
    store.deletePlan(p.id);
    assert.deepEqual(store.loadPlans(), []);
    assert.deepEqual(store.loadFavourites(), ['easy-30']);
  });

  test('stary plan z „przerwą" w środku biegu poprawia się przy wczytaniu', () => {
    const p = plan();
    p.segments[2] = { ...p.segments[2], kind: 'recovery' };
    ls.setItem('ziprun.plans', JSON.stringify([p]));
    const [wczytany] = store.loadPlans();
    assert.ok(!wczytany.segments.some((s) => s.kind === 'recovery'));
    // Poprawka jest od razu zapisana, a nie liczona przy każdym odczycie.
    assert.ok(!ls.getItem('ziprun.plans').includes('recovery'));
  });

  test('prawdziwe przerwy w interwałach zostają nietknięte', () => {
    const p = generujPlan({ typ: 'interwaly', intensywnosc: 'srednia', minuty: 30 });
    store.savePlan(p);
    assert.ok(store.loadPlans()[0].segments.some((s) => s.kind === 'recovery'));
  });

  test('stary plan marszowy z rozgrzewką w tempie treningu dostaje spacer', () => {
    const p = generujPlan({ typ: 'marsz', intensywnosc: 'lagodna', minuty: 30 });
    p.segments[0].s = 'walk';
    p.segments.at(-1).s = 'walk';
    const rdzen = JSON.stringify(p.segments.slice(1, -1));
    ls.setItem('ziprun.plans', JSON.stringify([p]));
    const [wczytany] = store.loadPlans();
    assert.equal(wczytany.segments[0].s, 'stroll');
    assert.equal(wczytany.segments.at(-1).s, 'stroll');
    assert.deepEqual(wczytany.segments.slice(1, -1), JSON.parse(rdzen), 'odcinki właściwe bez zmian');
  });
});

describe('ulubione', () => {
  test('przełącznik dodaje na początek i usuwa', () => {
    store.toggleFavourite('a');
    assert.deepEqual(store.toggleFavourite('b'), ['b', 'a']);
    assert.deepEqual(store.toggleFavourite('a'), ['b']);
  });

  test('śmieci w zapisie są odfiltrowane', () => {
    ls.setItem('ziprun.favourites', JSON.stringify(['a', 3, null, 'b']));
    assert.deepEqual(store.loadFavourites(), ['a', 'b']);
  });
});

describe('historia', () => {
  test('najnowszy trening na początku, próbki tylko dla dziesięciu ostatnich', () => {
    for (let i = 0; i < 12; i++) {
      store.addHistory(trening(new Date(2026, 8, i + 1).toISOString(), { samples: [{ t: 0 }] }));
    }
    const h = store.loadHistory();
    assert.equal(h.length, 12);
    assert.ok(new Date(h[0].date) > new Date(h[1].date));
    assert.equal(h.filter((x) => x.samples).length, 10);
  });

  test('statystyki sumują dystans i czas', () => {
    const teraz = new Date().toISOString();
    const st = store.historyStats([
      trening(teraz, { distanceKm: 3.04 }),
      trening('2020-01-01T00:00:00.000Z', { distanceKm: 5, completed: false }),
    ]);
    assert.equal(st.count, 2);
    assert.equal(st.completed, 1);
    assert.equal(st.totalKm, 8);
    assert.equal(st.totalSec, 3600);
    assert.equal(st.weekCount, 1);
    assert.equal(st.weekKm, 3);
    assert.equal(st.totalUpM, 0, 'stare treningi nie mają przewyższenia');
  });

  test('statystyki sumują przewyższenie', () => {
    const st = store.historyStats([
      trening('2026-09-01T10:00:00.000Z', { przewyzszenieM: 530 }),
      trening('2026-09-02T10:00:00.000Z', { przewyzszenieM: 120 }),
      trening('2026-09-03T10:00:00.000Z'),
    ]);
    assert.equal(st.totalUpM, 650);
  });
});

describe('zapisy techniczne', () => {
  test('trzymane są trzy ostatnie', () => {
    for (let i = 0; i < 5; i++) store.addTrace({ date: 'd' + i, data: {} });
    assert.deepEqual(store.loadTraces().map((t) => t.date), ['d4', 'd3', 'd2']);
  });

  test('przy braku miejsca odrzucany jest najstarszy zapis', () => {
    ls = instalujLocalStorage({ limitZnakow: 2500 });
    const duzy = (date) => ({ date, data: { x: 'x'.repeat(1000) } });
    store.addTrace(duzy('stary'));
    store.addTrace(duzy('sredni'));
    const po = store.addTrace(duzy('nowy'));
    assert.deepEqual(po.map((t) => t.date), ['nowy', 'sredni']);
    ls = instalujLocalStorage();
  });
});

describe('kopia danych', () => {
  test('eksport zawiera wszystko, co aplikacja trzyma', () => {
    store.addHistory(trening('2026-09-01T10:00:00.000Z'));
    store.savePlan(plan());
    store.toggleFavourite('easy-30');
    const k = store.eksportDanych();
    assert.equal(k.aplikacja, 'ZipRun');
    assert.equal(k.historia.length, 1);
    assert.equal(k.plany.length, 1);
    assert.deepEqual(k.ulubione, ['easy-30']);
    assert.ok(store.czyPoprawnaKopia(k));
  });

  test('obcy plik jest odrzucany', () => {
    assert.equal(store.czyPoprawnaKopia({ historia: [] }), false);
    assert.equal(store.czyPoprawnaKopia(null), false);
    assert.throws(() => store.importujDane({ aplikacja: 'Inna', historia: [] }));
  });

  test('import dopisuje treningi i pomija powtórki', () => {
    store.addHistory(trening('2026-09-01T10:00:00.000Z'));
    const kopia = store.eksportDanych();
    kopia.historia.push(trening('2026-09-02T10:00:00.000Z'));
    const w = store.importujDane(kopia);
    assert.equal(w.dodane, 1);
    assert.equal(w.pominiete, 1);
    assert.equal(store.loadHistory().length, 2);
  });

  test('ponowny import tego samego pliku niczego nie duplikuje', () => {
    store.addHistory(trening('2026-09-01T10:00:00.000Z'));
    store.savePlan(plan());
    const kopia = store.eksportDanych();
    store.importujDane(kopia);
    store.importujDane(kopia);
    assert.equal(store.loadHistory().length, 1);
    assert.equal(store.loadPlans().length, 1);
  });

  test('import scala ulubione, a nie zastępuje', () => {
    store.toggleFavourite('tu');
    store.importujDane({ aplikacja: 'ZipRun', historia: [], ulubione: ['tam'] });
    assert.deepEqual(store.loadFavourites().sort(), ['tam', 'tu']);
  });

  test('profil zmienia się tylko na wyraźne życzenie', () => {
    const kopia = { aplikacja: 'ZipRun', historia: [], profil: { easy: 10.5 }, ustawienia: { voice: false } };
    store.importujDane(kopia);
    assert.equal(store.loadProfile().easy, DEFAULT_PROFILE.easy);
    store.importujDane(kopia, { zProfilem: true });
    assert.equal(store.loadProfile().easy, 10.5);
    assert.equal(store.loadSettings().voice, false);
  });

  test('plan bez odcinków w kopii nie trafia do listy', () => {
    const w = store.importujDane({ aplikacja: 'ZipRun', historia: [], plany: [{ id: 'zly' }, plan()] });
    assert.equal(w.planowDodanych, 1);
    assert.equal(store.loadPlans().length, 1);
  });
});

describe('plany spoza aplikacji', () => {
  const zly = (nadpisz) => ({ ...plan(), ...nadpisz });
  const odcinek = (nadpisz) => ({ ...plan(), segments: [{ t: 60, s: 9, kind: 'work', label: 'Bieg', ...nadpisz }] });

  test('prawdziwe plany z generatora i z edytora przechodzą bez zmian', () => {
    const z = plan();
    assert.deepEqual(store.oczyscPlan(z).segments, z.segments.map((s) => ({ i: 0, ...s })));
    const edytor = { id: 'edytor-abc', name: 'Z edytora', focus: 'Z edytora', desc: '', custom: true, zEdytora: true,
      segments: [{ t: 60, s: 12.5, i: 4, kind: 'sprint', label: 'Sprint 1' }] };
    assert.deepEqual(store.oczyscPlan(edytor), edytor);
  });

  test('kod w rodzaju odcinka odrzuca cały plan', () => {
    assert.equal(store.oczyscPlan(odcinek({ kind: 'work"><img src=x onerror=alert(1)>' })), null);
  });

  test('złe liczby i nieznane kotwice odrzucają plan', () => {
    for (const z of [{ t: '60' }, { t: -5 }, { t: Infinity }, { s: '9' }, { s: 'turbo' }, { s: 'constructor' }, { s: 99 }, { i: '<b>' }]) {
      assert.equal(store.oczyscPlan(odcinek(z)), null, JSON.stringify(z));
    }
  });

  test('poziom tylko 1–3, inaczej znika', () => {
    assert.equal(store.oczyscPlan(zly({ level: 2 })).level, 2);
    assert.equal('level' in store.oczyscPlan(zly({ level: '<img src=x onerror=alert(1)>' })), false);
    assert.equal('level' in store.oczyscPlan(zly({ level: 7 })), false);
  });

  test('teksty tylko jako tekst, bez znaków sterujących i z limitem długości', () => {
    const p = store.oczyscPlan(zly({ name: { toString: () => 'x' }, focus: 5, desc: 'a\u0007b' }));
    assert.equal(p.name, 'Plan');
    assert.equal(p.focus, '');
    assert.equal(p.desc, 'ab');
    assert.equal(store.oczyscPlan(zly({ name: 'x'.repeat(500) })).name.length, 80);
    assert.equal(store.oczyscPlan(odcinek({ label: 42 })).segments[0].label, 'Praca');
  });

  test('zły identyfikator odrzuca plan', () => {
    for (const id of ['', '<script>', 'a b', 5, 'x'.repeat(81)]) assert.equal(store.oczyscPlan(zly({ id })), null, String(id));
  });

  test('import kopii pomija spreparowane plany, prawdziwe dodaje', () => {
    const w = store.importujDane({ aplikacja: 'ZipRun', historia: [], plany: [
      odcinek({ kind: 'work"><img src=x onerror=alert(1)>' }),
      plan(),
    ] });
    assert.equal(w.planowDodanych, 1);
    assert.equal(store.loadPlans().length, 1);
  });

  test('spreparowany plan, który już leży w pamięci, nie jest wczytywany', () => {
    ls.setItem('ziprun.plans', JSON.stringify([odcinek({ kind: '"><svg onload=alert(1)>' }), plan()]));
    assert.equal(store.loadPlans().length, 1);
  });

  test('profil z kopii: tylko znane pola właściwego typu', () => {
    store.importujDane({ aplikacja: 'ZipRun', historia: [],
      profil: { easy: 9.5, fast: '<img src=x onerror=alert(1)>', maxInclineCap: NaN, obce: 1 },
      ustawienia: { voice: 'tak', countdown: 3, lastDeviceName: 'FS\u0007-X' } }, { zProfilem: true });
    const p = store.loadProfile();
    assert.equal(p.easy, 9.5);
    assert.equal(p.fast, DEFAULT_PROFILE.fast);
    assert.equal(p.maxInclineCap, DEFAULT_PROFILE.maxInclineCap);
    assert.equal('obce' in p, false);
    const s = store.loadSettings();
    assert.equal(s.voice, store.DEFAULT_SETTINGS.voice);
    assert.equal(s.countdown, 3);
    assert.equal(s.lastDeviceName, 'FS-X');
  });
});
