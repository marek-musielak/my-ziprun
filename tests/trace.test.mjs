// Zapis techniczny treningu.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SztucznaBieznia } from './helpers.mjs';
import { Trace, poczekajNaKoniecZapisu } from '../js/trace.js';
import { STATE } from '../js/engine.js';

/** Silnik w minimalnej postaci: emituje zdarzenia i zna swój stan. */
class SztucznySilnik extends SztucznaBieznia {
  constructor() { super(); this.state = STATE.RUNNING; this.speedFactor = 1; }
  targetSpeedFor(seg) { return Math.round(seg.speed * this.speedFactor * 10) / 10; }
}

const takt = (extra = {}) => ({
  segment: { label: 'Bieg', speed: 8 },
  totalElapsed: 10,
  distanceM: 22.4,
  targetSpeed: 8,
  metrics: { speed: 8, kcal: 3, hr: 0 },
  ...extra,
});

let czas, trace, tm, silnik;

beforeEach((t) => {
  czas = 1_000_000;
  t.mock.method(Date, 'now', () => czas);
  tm = new SztucznaBieznia();
  silnik = new SztucznySilnik();
  trace = new Trace().attach(tm, silnik);
  trace.start({ plan: 'Test', wersja: 'ZipRun 0.0.0' });
});

describe('Trace', () => {
  test('zbiera zdarzenia bieżni i silnika', () => {
    tm.emit('log', { msg: 'zapis 02 20 03' });
    tm.emit('status', { text: 'start', raw: '04' });
    silnik.emit('msg', 'Uwaga testowa');
    const rodzaje = trace.events.map((e) => e.kind);
    assert.deepEqual(rodzaje, ['trace', 'ble', 'bieżnia', 'uwaga']);
  });

  test('po zatrzymaniu niczego już nie dopisuje', () => {
    trace.stop();
    const ile = trace.events.length;
    tm.emit('log', { msg: 'za późno' });
    silnik.emit('tick', takt());
    assert.equal(trace.events.length, ile);
    assert.equal(trace.recording, false);
  });

  test('pomiary najwyżej raz na sekundę, ale każda zmiana prędkości od razu', () => {
    silnik.emit('tick', takt());
    czas += 250;
    silnik.emit('tick', takt()); // ta sama prędkość, za wcześnie — pominięty
    czas += 250;
    silnik.emit('tick', takt({ metrics: { speed: 8.5 } })); // zmiana — zapisany
    czas += 1000;
    silnik.emit('tick', takt({ metrics: { speed: 8.5 } })); // minęła sekunda — zapisany
    assert.deepEqual(trace.metrics.map((m) => m.speed), [8, 8.5, 8.5]);
  });

  test('odliczanie przed startem nie trafia do pomiarów', () => {
    silnik.emit('tick', { countdown: 3 });
    assert.equal(trace.metrics.length, 0);
  });

  test('po treningu pomiary idą ze strumienia bieżni — widać hamowanie', () => {
    silnik.state = STATE.FINISHED;
    tm.emit('data', { speed: 3.2, distance: 3000 });
    assert.equal(trace.metrics.at(-1).segment, '(po treningu)');
    assert.equal(trace.metrics.at(-1).speed, 3.2);
  });

  test('w schłodzeniu pomiary idą z taktów silnika, bez dublowania ze strumienia bieżni', () => {
    silnik.state = STATE.COOLDOWN;
    tm.emit('data', { speed: 4 });
    assert.equal(trace.metrics.length, 0);
    silnik.emit('tick', takt({ segment: { label: 'Schłodzenie po treningu', speed: 4 }, metrics: { speed: 4 } }));
    assert.equal(trace.metrics.at(-1).segment, 'Schłodzenie po treningu');
  });

  test('odcinek w logu pokazuje prędkość zamówioną, a plan w nawiasie', () => {
    silnik.speedFactor = 1.2;
    silnik.emit('segment', { index: 1, segment: { label: 'Bieg', speed: 8, duration: 60 } });
    assert.match(trace.events.at(-1).text, /9\.6 km\/h \(plan 8\.0\)/);
  });

  test('raport tekstowy: nagłówek, zdarzenia, CSV i nowa linia na końcu', () => {
    silnik.emit('tick', takt());
    const txt = trace.toText({ wynik: '0:10, 0.02 km, przerwany' });
    assert.match(txt, /^=== ZAPIS TECHNICZNY TRENINGU \(ZipRun\) ===/);
    assert.match(txt, /plan: Test/);
    assert.match(txt, /wynik: 0:10, 0.02 km, przerwany/);
    assert.match(txt, /--- POMIARY \(CSV\) ---/);
    assert.match(txt, /\n0;10;8;8;22;3;;;Bieg\n$/);
  });

  test('zapis z pamięci daje ten sam raport', () => {
    silnik.emit('tick', takt());
    trace.stop();
    const odtworzony = Trace.fromStored(JSON.parse(JSON.stringify(trace.toStored())));
    assert.equal(odtworzony.toText(), trace.toText());
  });

  test('czekanie na koniec zapisu kończy się, gdy rejestrator stanie', async () => {
    Date.now.mock.restore();
    const t = new Trace();
    t.start();
    setTimeout(() => t.stop(), 30);
    assert.equal(await poczekajNaKoniecZapisu(t, 2000, 10), true);
  });

  test('czekanie ma limit — nie wisi w nieskończoność', async () => {
    Date.now.mock.restore();
    const t = new Trace();
    t.start();
    assert.equal(await poczekajNaKoniecZapisu(t, 50, 10), false);
  });
});
