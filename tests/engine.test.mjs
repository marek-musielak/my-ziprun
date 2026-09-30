// Silnik treningu — tu siedzą zabezpieczenia, które chronią biegacza na pasie.

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { instalujZegar, SztucznaBieznia, dokonczObietnice } from './helpers.mjs';
import { WorkoutEngine, STATE, rampSeconds, SCHLODZENIE } from '../js/engine.js';
import { DEFAULT_PROFILE } from '../js/plans.js';

const PLAN = {
  id: 'test',
  name: 'Plan testowy',
  segments: [
    { t: 20, s: 5, kind: 'warmup', label: 'Rozgrzewka' },
    { t: 20, s: 8, kind: 'work', label: 'Bieg' },
    { t: 20, s: 5, kind: 'cooldown', label: 'Schłodzenie' },
  ],
};

let zegar, tm, engine;

/**
 * Start bez odliczania i bez prawdziwego interwału — takty podaje test.
 * Pas „już jedzie" (metrics.speed), więc silnik nie czeka na jego ruszenie.
 */
async function uruchom({ auto = true, followManual = true, plan = PLAN, incline = false } = {}) {
  tm = new SztucznaBieznia({ speed: auto, incline });
  tm.metrics = { speed: 5 };
  engine = new WorkoutEngine(tm, null);
  engine.load(plan, { ...DEFAULT_PROFILE });
  engine.followManual = followManual;
  await engine.start(0);
  clearInterval(engine._timer);
  await dokonczObietnice();
}

/** Przewija trening o zadaną liczbę sekund, takt po takcie (co 250 ms). */
function przewin(sekundy) {
  for (let i = 0; i < Math.round(sekundy * 4); i++) {
    zegar.przesun(250);
    engine._tick();
  }
}

beforeEach(() => { zegar = instalujZegar(); });
afterEach(() => { if (engine) clearInterval(engine._timer); });

describe('rampSeconds', () => {
  test('pojedyncza komenda to sama chwila na dojście pasa', () => {
    assert.equal(rampSeconds(0.1), 1);
    assert.equal(rampSeconds(0.5), 1);
  });
  test('każde kolejne pół km/h dokłada odstęp między komendami', () => {
    assert.equal(rampSeconds(1), 1.65);
    assert.equal(rampSeconds(3), 4.25);
  });
  test('kierunek zmiany nie ma znaczenia', () => {
    assert.equal(rampSeconds(-3), rampSeconds(3));
  });
});

describe('prędkość zadana', () => {
  beforeEach(() => {
    engine = new WorkoutEngine(new SztucznaBieznia(), null);
    engine.load(PLAN, { ...DEFAULT_PROFILE });
  });

  test('skala z panelu mnoży plan, korekta z ekranu dokłada się osobno', () => {
    engine.speedFactor = 1.2;
    engine.speedOffset = 1;
    const [rozgrzewka, bieg] = engine.plan.segments;
    assert.equal(engine.targetSpeedFor(bieg), 10.6);
    // Korekta pracy nie dotyczy odcinków poza pracą.
    assert.equal(engine.targetSpeedFor(rozgrzewka), 6);
  });

  test('nigdy nie przekracza limitu z profilu', () => {
    engine.load(PLAN, { ...DEFAULT_PROFILE, maxSpeedCap: 12 });
    engine.speedFactor = 1.5;
    engine.speedOffset = 2;
    assert.equal(engine.targetSpeedFor(engine.plan.segments[1]), 12);
  });

  test('nachylenie nigdy nie przekracza limitu z profilu', () => {
    engine.load({ ...PLAN, segments: [{ t: 60, s: 5, i: 15, kind: 'work', label: 'Pod górę' }] },
      { ...DEFAULT_PROFILE, maxInclineCap: 10 });
    engine.inclineOffset = 3;
    assert.equal(engine.targetInclineFor(engine.segment), 10);
  });

  test('nigdy nie schodzi poniżej zera', () => {
    engine.korektaOdcinka = -20;
    assert.equal(engine.targetSpeedFor(engine.plan.segments[0]), 0);
    engine.speedOffset = -20;
    assert.equal(engine.targetSpeedFor(engine.plan.segments[1]), 0);
  });
});

describe('przebieg treningu', () => {
  test('przechodzi przez wszystkie odcinki i kończy się ukończeniem', async () => {
    await uruchom({ auto: false });
    const odcinki = [];
    const koniec = [];
    engine.on('segment', (e) => odcinki.push(e.segment.label));
    engine.on('ended', (s) => koniec.push(s));

    przewin(61);

    assert.equal(engine.state, STATE.FINISHED);
    assert.deepEqual(odcinki, ['Bieg', 'Schłodzenie']);
    assert.equal(koniec.length, 1, 'zdarzenie "ended" leci dokładnie raz');
    assert.equal(koniec[0].completed, true);
    assert.equal(koniec[0].durationS, 60);
    assert.equal(koniec[0].segmentsDone, 3);
    assert.equal(koniec[0].plannedS, 60);
  });

  test('próbka do wykresu co pięć sekund, bez powtórzeń', async () => {
    await uruchom({ auto: false });
    przewin(20);
    assert.deepEqual(engine.samples.map((s) => s.t), [0, 5, 10, 15, 20]);
  });

  test('wyzerowanie licznika bieżni nie kasuje przebytego dystansu', async () => {
    await uruchom({ auto: false });
    tm.metrics = { speed: 5, distance: 100 };
    przewin(0.25);
    tm.metrics.distance = 200;
    przewin(0.25);
    tm.metrics.distance = 50; // pas zatrzymany z konsoli i ruszony ponownie
    przewin(0.25);
    assert.equal(engine.distanceM, 150);
  });

  test('bieżnia, która wysyła dystans stale równy zero, nie zeruje wyniku', async () => {
    // Tak robi FS-CA455B: pole dystansu jest w ramce, ale zawsze 0.
    await uruchom({ auto: false });
    tm.metrics = { speed: 7.2, distance: 0 }; // 2 m/s
    przewin(10);
    assert.ok(Math.abs(engine.distanceM - 20) < 1e-9, 'dystans: ' + engine.distanceM);
    assert.ok(engine.summary().avgSpeed > 7);
  });

  test('gdy licznik bieżni ruszy, wygrywa — bez podwójnego liczenia', async () => {
    await uruchom({ auto: false });
    tm.metrics = { speed: 7.2, distance: 0 };
    przewin(5);              // 10 m z prędkości, bieżnia jeszcze nic
    tm.metrics.distance = 12; // bieżnia policzyła od startu 12 m
    przewin(0.25);
    assert.equal(engine.distanceM, 12, 'licznik bieżni obejmuje cały dotychczasowy dystans');
    tm.metrics.distance = 30;
    przewin(0.25);
    assert.equal(engine.distanceM, 30);
  });

  test('bez dystansu z bieżni całkuje go z prędkości', async () => {
    await uruchom({ auto: false });
    tm.metrics = { speed: 7.2 }; // 2 m/s
    przewin(10);
    assert.ok(Math.abs(engine.distanceM - 20) < 1e-9, 'dystans: ' + engine.distanceM);
  });
});

describe('rozpędzanie przed odcinkiem', () => {
  test('rusza dokładnie tyle przed granicą, ile potrwa zmiana', async () => {
    await uruchom({ followManual: false });
    const przed = tm.rampy.length;
    const wyprzedzenie = rampSeconds(8 - 5); // 4,25 s

    przewin(20 - wyprzedzenie - 0.5);
    assert.equal(tm.rampy.length, przed, 'za wcześnie na rozpędzanie');
    assert.equal(engine.ramping, null);

    przewin(0.75);
    assert.equal(tm.rampy.at(-1), 8);
    assert.equal(engine.segIndex, 0, 'zegar wciąż na poprzednim odcinku');
    assert.equal(engine.ramping.target, 8);
    assert.equal(engine.ramping.up, true);
  });

  test('w trybie prowadzenia nie wysyła żadnej komendy prędkości', async () => {
    await uruchom({ auto: false });
    przewin(61);
    assert.deepEqual(tm.rampy, []);
  });
});

describe('zatrzymania', () => {
  test('pauza zatrzymuje zegar i przerywa rampę', async () => {
    await uruchom();
    przewin(5);
    await engine.pause();
    const czas = engine.totalElapsed;

    assert.equal(engine.state, STATE.PAUSED);
    assert.ok(tm.komendy.some((k) => k[0] === 'stopRamp'));
    assert.ok(tm.komendy.some((k) => k[0] === 'pauseBelt'));

    przewin(10);
    assert.equal(engine.totalElapsed, czas, 'zegar stoi w pauzie');
  });

  test('po pauzie żadna komenda prędkości nie dociera do bieżni', async () => {
    await uruchom();
    await engine.pause();
    const przed = tm.rampy.length;
    engine.adjustSpeed(+0.5);
    engine.adjustSpeed(+0.5);
    await dokonczObietnice();
    assert.equal(tm.rampy.length, przed);
  });

  test('po przerwaniu żadna komenda prędkości nie dociera do bieżni', async () => {
    await uruchom();
    await engine.abort();
    const przed = tm.rampy.length;
    engine.adjustSpeed(+1);
    przewin(30);
    await dokonczObietnice();
    assert.equal(tm.rampy.length, przed);
    assert.ok(tm.komendy.some((k) => k[0] === 'stopBelt'));
  });

  test('wyjęty kluczyk bezpieczeństwa przerywa trening', async () => {
    await uruchom();
    const koniec = [];
    engine.on('ended', (s) => koniec.push(s));
    tm.emit('status', { opcode: 0x03 });
    await dokonczObietnice();
    assert.equal(engine.state, STATE.ABORTED);
    assert.equal(koniec.length, 1);
    assert.equal(koniec[0].completed, false);
  });

  test('zatrzymanie pasa z konsoli wstrzymuje trening, nie kończy go', async () => {
    await uruchom();
    tm.emit('status', { opcode: 0x02 });
    await dokonczObietnice();
    assert.equal(engine.state, STATE.PAUSED);
  });

  test('wznowienie przywraca prędkość bieżącego odcinka', async () => {
    await uruchom({ followManual: false });
    przewin(25); // już w odcinku „Bieg", 8 km/h
    await engine.pause();
    await engine.resume();
    clearInterval(engine._timer);
    assert.equal(engine.state, STATE.RUNNING);
    assert.equal(tm.rampy.at(-1), 8);
  });
});

describe('podążanie za panelem bieżni', () => {
  test('stabilna zmiana prędkości staje się skalą reszty planu', async () => {
    await uruchom();
    przewin(3); // cisza po własnej komendzie startowej
    const rampPrzed = tm.rampy.length;

    tm.metrics.speed = 6;
    przewin(2.5);
    assert.equal(engine.speedFactor, 1, 'jeszcze nie — prędkość musi się utrzymać');

    przewin(1);
    assert.equal(engine.speedFactor, 1.2);
    assert.equal(tm.przejeta, 6, 'bieżnia dostaje nowy punkt wyjścia rampy');
    assert.equal(tm.rampy.length, rampPrzed, 'przejęcie nie wysyła żadnej komendy');
    assert.equal(engine.targetSpeedFor(engine.nextSegment), 9.6);
  });

  test('korekta jest ograniczona do półtorakrotności planu', async () => {
    await uruchom();
    przewin(3);
    tm.metrics.speed = 12;
    przewin(4);
    assert.equal(engine.speedFactor, 1.5);
  });

  test('korekta jest ograniczona do połowy planu', async () => {
    await uruchom();
    przewin(3);
    tm.metrics.speed = 1;
    przewin(4);
    assert.equal(engine.speedFactor, 0.5);
  });

  test('różnica poniżej 0,2 km/h to szum, nie decyzja', async () => {
    await uruchom();
    przewin(3);
    tm.metrics.speed = 5.1;
    przewin(10);
    assert.equal(engine.speedFactor, 1);
  });

  test('rozbieg pasa ze stania się nie liczy', async () => {
    await uruchom();
    przewin(3);
    tm.metrics.speed = 0.3;
    przewin(10);
    assert.equal(engine.speedFactor, 1);
  });

  test('wyłączone w ustawieniach niczego nie przejmuje', async () => {
    await uruchom({ followManual: false });
    przewin(3);
    tm.metrics.speed = 7;
    przewin(10);
    assert.equal(engine.speedFactor, 1);
  });

  test('w trakcie własnej rampy nic nie wnioskuje', async () => {
    await uruchom();
    przewin(20 - rampSeconds(3) + 0.25); // rampa do 8 km/h już trwa
    assert.ok(engine.ramping);
    tm.metrics.speed = 6.5; // wartość przelotowa w trakcie rozpędzania
    przewin(3.5);
    assert.equal(engine.speedFactor, 1);
  });
});

describe('przewyższenie', () => {
  test('10 km na 20 % bieżni to 1 km w górę', async () => {
    const plan = { id: 'x', name: 'Podbieg', segments: [{ t: 3600, s: 10, i: 20, kind: 'work', label: 'Pod górę' }] };
    await uruchom({ auto: false, plan });
    tm.metrics = { speed: 10 };
    const koniec = [];
    engine.on('ended', (s) => koniec.push(s));
    przewin(3601);
    assert.equal(koniec[0].przewyzszenieM, 1000);
  });

  test('liczone z nachylenia zgłoszonego przez bieżnię, nie z planu', async () => {
    await uruchom({ auto: false });
    tm.metrics = { speed: 7.2, incline: 10 }; // 2 m/s na 10 % → 0,1 m w górę na sekundę
    przewin(10);
    assert.ok(Math.abs(engine.przewyzszenieM - 1) < 1e-9, String(engine.przewyzszenieM));
  });

  test('po płaskim zero', async () => {
    await uruchom({ auto: false });
    przewin(61);
    assert.equal(engine.summary().przewyzszenieM, 0);
  });
});

describe('schłodzenie po planie z edytora', () => {
  const Z_EDYTORA = { ...PLAN, zEdytora: true };

  async function doSchlodzenia(opcje = {}) {
    await uruchom({ plan: Z_EDYTORA, followManual: false, ...opcje });
    const zdarzenia = { wynik: [], ended: [] };
    engine.on('wynik', (s) => zdarzenia.wynik.push(s));
    engine.on('ended', (s) => zdarzenia.ended.push(s));
    przewin(60.25);
    await dokonczObietnice();
    return zdarzenia;
  }

  test('plan wbudowany kończy się bez schłodzenia', async () => {
    await uruchom({ auto: false });
    przewin(61);
    assert.equal(engine.state, STATE.FINISHED);
  });

  test('po ostatnim odcinku wynik jest gotowy, a pas przechodzi na 4 km/h', async () => {
    const z = await doSchlodzenia();
    assert.equal(engine.state, STATE.COOLDOWN);
    assert.equal(z.wynik.length, 1, 'wynik zapisuje się od razu');
    assert.equal(z.ended.length, 0, 'podsumowanie dopiero po schłodzeniu');
    assert.equal(z.wynik[0].completed, true);
    assert.equal(z.wynik[0].durationS, 60);
    assert.equal(z.wynik[0].segmentsDone, 3);
    assert.equal(tm.rampy.at(-1), 4);
  });

  test('schłodzenie nie wlicza się do wyniku', async () => {
    const z = await doSchlodzenia();
    const przed = JSON.stringify(z.wynik[0]);
    tm.metrics = { speed: 4, distance: 5000 };
    przewin(SCHLODZENIE.t + 1);
    await dokonczObietnice();
    assert.equal(engine.state, STATE.FINISHED);
    assert.equal(z.ended.length, 1);
    assert.equal(z.ended[0], z.wynik[0], 'ten sam wynik, nie nowy');
    assert.equal(JSON.stringify(z.ended[0]), przed, 'wynik nie zmienił się w trakcie schłodzenia');
    assert.ok(tm.komendy.some((k) => k[0] === 'stopBelt'));
  });

  test('trwa dokładnie 15 minut', async () => {
    const z = await doSchlodzenia();
    przewin(SCHLODZENIE.t - 1);
    assert.equal(engine.state, STATE.COOLDOWN);
    przewin(1.25);
    await dokonczObietnice();
    assert.equal(z.ended.length, 1);
  });

  test('dokładnie 4 km/h i 0 % — bez skali z panelu i bez korekt', async () => {
    await uruchom({ plan: Z_EDYTORA, followManual: false, incline: true });
    engine.speedFactor = 1.5;
    engine.speedOffset = 2;
    engine.inclineOffset = 5;
    przewin(60.25);
    await dokonczObietnice();
    assert.equal(tm.rampy.at(-1), 4);
    assert.deepEqual(tm.komendy.filter((k) => k[0] === 'setIncline').at(-1), ['setIncline', 0]);
  });

  test('korekty i panel bieżni w trakcie schłodzenia nie wysyłają komend', async () => {
    await doSchlodzenia({ followManual: true });
    const przed = tm.rampy.length;
    engine.adjustSpeed(+0.5);
    tm.metrics = { speed: 6 };
    przewin(10);
    await dokonczObietnice();
    assert.equal(tm.rampy.length, przed);
    assert.equal(engine.speedFactor, 1);
  });

  test('„Zakończ trening" kończy schłodzenie, trening zostaje ukończony', async () => {
    const z = await doSchlodzenia();
    przewin(30);
    await engine.abort('Trening zatrzymany.');
    assert.equal(engine.state, STATE.FINISHED);
    assert.equal(z.ended.length, 1);
    assert.equal(z.ended[0].completed, true);
    assert.equal(z.ended[0].durationS, 60);
  });

  test('zatrzymanie pasa z konsoli kończy schłodzenie zamiast pauzy', async () => {
    const z = await doSchlodzenia();
    tm.emit('status', { opcode: 0x02 });
    await dokonczObietnice();
    assert.equal(engine.state, STATE.FINISHED);
    assert.equal(z.ended.length, 1);
  });

  test('ekran dostaje odliczanie schłodzenia i zamrożony wynik', async () => {
    await doSchlodzenia();
    const takty = [];
    engine.on('tick', (d) => takty.push(d));
    przewin(60);
    const d = takty.at(-1);
    assert.ok(Math.abs(d.schlodzenie.pozostalo - (SCHLODZENIE.t - 60)) < 0.3);
    assert.equal(d.wynik.durationS, 60);
  });

  test('przerwanie w trakcie treningu nie uruchamia schłodzenia', async () => {
    await uruchom({ plan: Z_EDYTORA });
    przewin(10);
    await engine.abort();
    assert.equal(engine.state, STATE.ABORTED);
  });
});

describe('korekta ±0,5', () => {
  // rozgrzewka 5, praca 8, przerwa 6, praca 8, schłodzenie 5 — po 20 s
  const PLAN_KOREKTY = {
    id: 'korekta', name: 'Korekta', segments: [
      { t: 20, s: 5, kind: 'warmup', label: 'Rozgrzewka' },
      { t: 20, s: 8, kind: 'work', label: 'Praca 1' },
      { t: 20, s: 6, kind: 'recovery', label: 'Przerwa' },
      { t: 20, s: 8, kind: 'work', label: 'Praca 2' },
      { t: 20, s: 5, kind: 'cooldown', label: 'Schłodzenie' },
    ],
  };
  const cele = () => engine.plan.segments.map((s) => engine.targetSpeedFor(s));

  test('w pracy: ta praca i każda kolejna, reszta bez zmian', async () => {
    await uruchom({ plan: PLAN_KOREKTY, followManual: false });
    przewin(25); // Praca 1
    engine.adjustSpeed(+0.5);
    engine.adjustSpeed(+0.5);
    assert.deepEqual(cele(), [5, 9, 6, 9, 5]);
    assert.equal(engine.korektaTeraz, 1);
  });

  test('poza pracą: tylko bieżący odcinek', async () => {
    await uruchom({ plan: PLAN_KOREKTY, followManual: false });
    przewin(45); // Przerwa
    engine.adjustSpeed(-0.5);
    assert.deepEqual(cele(), [5, 8, 5.5, 8, 5]);
    assert.equal(engine.korektaTeraz, -0.5);
  });

  test('korekta poza pracą znika wraz z końcem odcinka', async () => {
    await uruchom({ plan: PLAN_KOREKTY, followManual: false });
    przewin(5); // Rozgrzewka
    engine.adjustSpeed(+0.5);
    assert.equal(engine.targetSpeedFor(engine.segment), 5.5);
    przewin(20); // już Praca 1
    assert.equal(engine.segment.label, 'Praca 1');
    assert.deepEqual(cele(), [5, 8, 6, 8, 5]);
    assert.equal(engine.korektaTeraz, 0);
  });

  test('korekta pracy zostaje po przerwie', async () => {
    await uruchom({ plan: PLAN_KOREKTY, followManual: false });
    przewin(25);
    engine.adjustSpeed(+0.5);
    przewin(20); // Przerwa
    assert.equal(engine.targetSpeedFor(engine.segment), 6, 'przerwa według planu');
    przewin(20); // Praca 2
    assert.equal(engine.targetSpeedFor(engine.segment), 8.5);
  });

  test('nowa prędkość idzie do bieżni od razu', async () => {
    await uruchom({ plan: PLAN_KOREKTY, followManual: false });
    przewin(45); // Przerwa
    engine.adjustSpeed(+0.5);
    await dokonczObietnice();
    assert.equal(tm.rampy.at(-1), 6.5);
  });

  test('w historii zostaje korekta pracy', async () => {
    await uruchom({ plan: PLAN_KOREKTY, followManual: false });
    przewin(25);
    engine.adjustSpeed(+0.5);
    przewin(20);
    engine.adjustSpeed(-0.5); // w przerwie — nie wpływa na korektę pracy
    assert.equal(engine.summary().speedOffset, 0.5);
  });
});

describe('sprint', () => {
  // praca 8, sprint 16, przerwa 6, praca 8, sprint 16 — po 20 s
  const PLAN_SPRINTOW = {
    id: 'sprinty', name: 'Sprinty', segments: [
      { t: 20, s: 8, kind: 'work', label: 'Praca 1' },
      { t: 20, s: 16, kind: 'sprint', label: 'Sprint 1' },
      { t: 20, s: 6, kind: 'recovery', label: 'Przerwa' },
      { t: 20, s: 8, kind: 'work', label: 'Praca 2' },
      { t: 20, s: 16, kind: 'sprint', label: 'Sprint 2' },
    ],
  };
  const cele = () => engine.plan.segments.map((s) => engine.targetSpeedFor(s));

  test('± w sprincie zmienia o 0,2 ten i każdy kolejny sprint', async () => {
    await uruchom({ plan: PLAN_SPRINTOW, followManual: false });
    przewin(25); // Sprint 1
    assert.equal(engine.krokKorekty, 0.2);
    engine.adjustSpeed(+0.5); // przycisk podaje tylko kierunek
    engine.adjustSpeed(+0.5);
    assert.deepEqual(cele(), [8, 16.4, 6, 8, 16.4]);
  });

  test('korekta sprintów i pracy są osobne', async () => {
    await uruchom({ plan: PLAN_SPRINTOW, followManual: false });
    przewin(5); // Praca 1
    assert.equal(engine.krokKorekty, 0.5);
    engine.adjustSpeed(+0.5);
    przewin(20); // Sprint 1
    engine.adjustSpeed(-0.5);
    assert.deepEqual(cele(), [8.5, 15.8, 6, 8.5, 15.8]);
  });

  test('korekta sprintów zostaje po przerwie i trafia do wyniku', async () => {
    await uruchom({ plan: PLAN_SPRINTOW, followManual: false });
    przewin(25);
    engine.adjustSpeed(+0.5);
    przewin(60); // Sprint 2
    assert.equal(engine.targetSpeedFor(engine.segment), 16.2);
    const s = engine.summary();
    assert.equal(s.korektaSprintow, 0.2);
    assert.equal(s.speedOffset, 0);
  });

  test('nowa prędkość sprintu idzie do bieżni od razu', async () => {
    await uruchom({ plan: PLAN_SPRINTOW, followManual: false });
    przewin(25);
    engine.adjustSpeed(+0.5);
    await dokonczObietnice();
    assert.equal(tm.rampy.at(-1), 16.2);
  });
});

describe('zwalnianie ze sprintu', () => {
  // Skok o 6 km/h: rampa trwa 8,15 s, więc zwykły odcinek zwalnia 8,15 s przed końcem.
  const skok = rampSeconds(6);
  const plan = (rodzaj) => ({
    id: 'sprint', name: 'Sprint', segments: [
      { t: 30, s: 15, kind: rodzaj, label: 'Szybko' },
      { t: 30, s: 9, kind: 'recovery', label: 'Przerwa' },
    ],
  });

  /** Przewija do chwili, gdy zostaje `zostalo` sekund, i podaje, czy rampa już ruszyła. */
  async function czyRuszylo(rodzaj, zostalo) {
    await uruchom({ plan: plan(rodzaj), followManual: false });
    const przed = tm.rampy.length;
    przewin(30 - zostalo);
    return tm.rampy.length > przed && tm.rampy.at(-1) === 9;
  }

  test('zwykły odcinek zwalnia tyle przed końcem, ile trwa rampa', async () => {
    assert.equal(await czyRuszylo('work', skok + 0.5), false, 'za wcześnie');
    assert.equal(await czyRuszylo('work', skok - 0.5), true);
  });

  test('sprint zwalnia dwie sekundy później niż zwykły odcinek', async () => {
    const zostalo = skok - 2;
    assert.equal(await czyRuszylo('sprint', zostalo + 0.5), false, 'jeszcze biegnie sprint');
    assert.equal(await czyRuszylo('sprint', zostalo - 0.5), true);
  });

  test('w miejscu, gdzie zwykły odcinek już zwalnia, sprint jeszcze nie', async () => {
    const zostalo = skok - 0.5;
    assert.equal(await czyRuszylo('work', zostalo), true);
    assert.equal(await czyRuszylo('sprint', zostalo), false);
  });

  test('rozpędzanie przed sprintem nie jest opóźniane', async () => {
    // Przerwa 9 -> sprint 15: rampa w górę, wyprzedzenie bez zmian.
    const wgore = {
      id: 'wgore', name: 'W górę', segments: [
        { t: 30, s: 9, kind: 'recovery', label: 'Przerwa' },
        { t: 30, s: 15, kind: 'sprint', label: 'Szybko' },
      ],
    };
    await uruchom({ plan: wgore, followManual: false });
    const przed = tm.rampy.length;
    przewin(30 - (skok - 0.5));
    assert.ok(tm.rampy.length > przed && tm.rampy.at(-1) === 15);
  });

  test('sprint przechodzący w sprint wolniejszy też zwalnia później', async () => {
    const dwa = {
      id: 'dwa', name: 'Dwa sprinty', segments: [
        { t: 30, s: 15, kind: 'sprint', label: 'Sprint 1' },
        { t: 30, s: 9, kind: 'sprint', label: 'Sprint 2' },
      ],
    };
    await uruchom({ plan: dwa, followManual: false });
    const przed = tm.rampy.length;
    przewin(30 - (skok - 1));
    assert.equal(tm.rampy.length, przed, 'rampa nie powinna jeszcze ruszyć');
    przewin(1.5);
    assert.ok(tm.rampy.length > przed);
  });

  test('sprint na sam koniec planu niczego nie zmienia', async () => {
    const jeden = { id: 'jeden', name: 'Jeden', segments: [{ t: 30, s: 15, kind: 'sprint', label: 'Szybko' }] };
    await uruchom({ plan: jeden, followManual: false });
    przewin(31);
    assert.equal(engine.state, STATE.FINISHED);
  });
});

describe('odliczanie na starcie', () => {
  /**
   * Podrobiony głos: zapisuje kolejność zdarzeń, a zapowiedź kończy się dopiero, gdy test
   * to zdecyduje — tak jak prawdziwa synteza mowy, która trwa ułamek sekundy.
   */
  function glos() {
    const zdarzenia = [];
    let zakoncz;
    const zapowiedz = new Promise((r) => { zakoncz = r; });
    return {
      zdarzenia,
      zakonczZapowiedz: zakoncz,
      glos: {
        say: (t) => zdarzenia.push('say:' + t),
        sayAndWait: (t) => { zdarzenia.push('zapowiedz:' + t); return zapowiedz; },
      },
    };
  }

  function silnikZGlosem(g) {
    tm = new SztucznaBieznia({ speed: false }); // tryb prowadzenia: bez czekania na pas
    engine = new WorkoutEngine(tm, g.glos);
    engine.load(PLAN, { ...DEFAULT_PROFILE });
    engine.on('tick', (d) => { if (d.countdown != null) g.zdarzenia.push('tick:' + d.countdown); });
  }

  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
  afterEach(() => mock.timers.reset());

  test('najpierw zapowiedź, dopiero po jej końcu odliczanie', async () => {
    const g = glos();
    silnikZGlosem(g);
    const start = engine.start(2);
    await dokonczObietnice();

    // Na ekranie stoi liczba początkowa, a zapowiedź trwa.
    assert.deepEqual(g.zdarzenia, ['tick:2', 'zapowiedz:Start za 2 sekundy']);
    mock.timers.tick(10_000);
    await dokonczObietnice();
    assert.deepEqual(g.zdarzenia, ['tick:2', 'zapowiedz:Start za 2 sekundy'],
      'odliczanie nie rusza, dopóki zapowiedź się nie skończy');

    g.zakonczZapowiedz();
    await dokonczObietnice();
    mock.timers.tick(1000);
    await dokonczObietnice();
    assert.deepEqual(g.zdarzenia.slice(2), ['tick:1', 'say:1']);

    mock.timers.tick(1000);
    await start;
    assert.equal(engine.state, STATE.RUNNING);
  });

  test('pierwsza liczba nie jest wypowiadana drugi raz', async () => {
    const g = glos();
    silnikZGlosem(g);
    const start = engine.start(3);
    await dokonczObietnice();
    g.zakonczZapowiedz();
    for (let k = 0; k < 3; k++) { await dokonczObietnice(); mock.timers.tick(1000); }
    await start;
    const wypowiedziane = g.zdarzenia.filter((z) => z.startsWith('say:') && /^say:\d$/.test(z));
    assert.deepEqual(wypowiedziane, ['say:2', 'say:1']);
  });

  test('zapowiedź odmienia sekundy po polsku', async () => {
    const teksty = [];
    for (const n of [1, 2, 5, 12]) {
      const g = glos();
      silnikZGlosem(g);
      engine.start(n);
      await dokonczObietnice();
      teksty.push(g.zdarzenia.find((z) => z.startsWith('zapowiedz:')));
      await engine.abort();
    }
    assert.deepEqual(teksty, [
      'zapowiedz:Start za 1 sekundę', 'zapowiedz:Start za 2 sekundy',
      'zapowiedz:Start za 5 sekund', 'zapowiedz:Start za 12 sekund',
    ]);
  });

  test('przerwanie w trakcie zapowiedzi nie uruchamia odliczania ani treningu', async () => {
    const g = glos();
    silnikZGlosem(g);
    const start = engine.start(2);
    await dokonczObietnice();
    await engine.abort();

    g.zakonczZapowiedz();
    await dokonczObietnice();
    mock.timers.tick(5000);
    await start;

    assert.equal(engine.state, STATE.ABORTED);
    assert.ok(!g.zdarzenia.includes('tick:1'));
  });

  test('bez odliczania nie ma zapowiedzi', async () => {
    const g = glos();
    silnikZGlosem(g);
    await engine.start(0);
    assert.ok(!g.zdarzenia.some((z) => z.startsWith('zapowiedz:')));
    assert.equal(engine.state, STATE.RUNNING);
  });

  test('bez głosu odliczanie działa jak dotąd', async () => {
    tm = new SztucznaBieznia({ speed: false });
    engine = new WorkoutEngine(tm, null);
    engine.load(PLAN, { ...DEFAULT_PROFILE });
    const start = engine.start(1);
    await dokonczObietnice();
    mock.timers.tick(1000);
    await start;
    assert.equal(engine.state, STATE.RUNNING);
  });
});
