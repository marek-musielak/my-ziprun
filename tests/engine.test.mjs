// Silnik treningu — tu siedzą zabezpieczenia, które chronią biegacza na pasie.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { instalujZegar, SztucznaBieznia, dokonczObietnice } from './helpers.mjs';
import { WorkoutEngine, STATE, rampSeconds } from '../js/engine.js';
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
async function uruchom({ auto = true, followManual = true, plan = PLAN } = {}) {
  tm = new SztucznaBieznia({ speed: auto });
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
    // Poza pracą korekta działa w połowie.
    assert.equal(engine.targetSpeedFor(rozgrzewka), 6.5);
  });

  test('nigdy nie przekracza limitu z profilu', () => {
    engine.speedFactor = 1.5;
    engine.speedOffset = 2;
    assert.equal(engine.targetSpeedFor(engine.plan.segments[1]), DEFAULT_PROFILE.maxSpeedCap);
  });

  test('nigdy nie schodzi poniżej zera', () => {
    engine.speedOffset = -20;
    assert.equal(engine.targetSpeedFor(engine.plan.segments[0]), 0);
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
