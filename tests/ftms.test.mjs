// Parsowanie ramek standardu FTMS i narzędzia do bajtów.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseTreadmillData, parseFeature } from '../js/ble/ftms.js';
import { hex, parseHex } from '../js/ble/uuids.js';

const ramka = (str) => new DataView(parseHex(str).buffer);

describe('parseTreadmillData', () => {
  test('prędkość i dystans', () => {
    // flagi 0x0004: dystans obecny; bit 0 = 0, więc prędkość też jest.
    // 0x0226 = 550 → 5,50 km/h; 0x0004D2 = 1234 m.
    const m = parseTreadmillData(ramka('04 00 26 02 D2 04 00'));
    assert.equal(m.speed, 5.5);
    assert.equal(m.distance, 1234);
    assert.equal(m.flags, 4);
  });

  test('bit „More Data" oznacza BRAK prędkości — logika odwrotna', () => {
    const m = parseTreadmillData(ramka('01 00'));
    assert.equal(m.speed, undefined);
  });

  test('dystans powyżej 65 km mieści się w trzech bajtach', () => {
    const m = parseTreadmillData(ramka('04 00 00 00 A0 86 01')); // 100000 m
    assert.equal(m.distance, 100000);
  });

  test('nachylenie ze znakiem', () => {
    // flagi 0x0008: nachylenie i kąt; -2,5% i -1,4°.
    const m = parseTreadmillData(ramka('08 00 00 00 E7 FF F2 FF'));
    assert.equal(m.incline, -2.5);
    assert.equal(m.rampAngle, -1.4);
  });

  test('kalorie, tętno i czas trwania w jednej ramce', () => {
    // flagi 0x0580: kalorie (bit 7), tętno (bit 8), czas (bit 10).
    const m = parseTreadmillData(ramka('80 05 E8 03 2C 01 C8 00 05 8C 96 00'));
    assert.equal(m.speed, 10);
    assert.equal(m.kcal, 300);
    assert.equal(m.kcalPerHour, 200);
    assert.equal(m.kcalPerMin, 5);
    assert.equal(m.hr, 140);
    assert.equal(m.elapsed, 150);
  });

  test('0xFFFF w kaloriach znaczy „niedostępne"', () => {
    const m = parseTreadmillData(ramka('80 00 00 00 FF FF 00 00 00'));
    assert.equal('kcal' in m, false);
  });

  test('surowe bajty zostają w wyniku do zapisu technicznego', () => {
    assert.equal(parseTreadmillData(ramka('00 00 26 02')).raw, '00 00 26 02');
  });
});

describe('parseFeature', () => {
  test('sterowanie prędkością bez nachylenia — jak Zipro Newlite', () => {
    // Funkcje: dystans (bit 2), kalorie (9), tętno (10). Ustawienia: prędkość (bit 0).
    const f = parseFeature(ramka('04 06 00 00 01 00 00 00'));
    assert.equal(f.canSetSpeed, true);
    assert.equal(f.canSetIncline, false);
    assert.equal(f.totalDistance, true);
    assert.equal(f.expendedEnergy, true);
    assert.equal(f.heartRate, true);
    assert.equal(f.inclineSupported, false);
  });
});

describe('hex i parseHex', () => {
  test('w obie strony', () => {
    assert.equal(hex(parseHex('02 58 02')), '02 58 02');
  });
  test('przyjmuje prefiks 0x, przecinki i małe litery', () => {
    assert.deepEqual([...parseHex('0x02, 0xff ab')], [0x02, 0xff, 0xab]);
  });
  test('pusty napis daje pustą ramkę', () => {
    assert.equal(parseHex('   ').length, 0);
  });
});
