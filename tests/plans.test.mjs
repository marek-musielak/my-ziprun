// Plany wbudowane i przeliczanie kotwic wysiłku na km/h.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANS, DEFAULT_PROFILE, anchorSpeed, resolvePlan, planById, fmtTime, cooperVo2, KIND_LABEL,
} from '../js/plans.js';

const KOTWICE = ['stroll', 'walk', 'brisk', 'jog', 'easy', 'steady', 'tempo', 'threshold', 'vo2', 'sprint'];

describe('plany wbudowane', () => {
  test('identyfikatory są unikalne', () => {
    assert.equal(new Set(PLANS.map((p) => p.id)).size, PLANS.length);
  });

  test('każdy plan rozwiązuje się z domyślnym profilem', () => {
    for (const plan of PLANS) {
      const r = resolvePlan(plan, DEFAULT_PROFILE);
      assert.ok(r.totalSeconds > 0, plan.id);
      assert.ok(r.estDistanceKm > 0, plan.id);
      for (const s of r.segments) {
        assert.ok(s.duration > 0, plan.id + ': ' + s.label);
        assert.ok(s.speed > 0, plan.id + ': ' + s.label);
        assert.ok(s.speed <= DEFAULT_PROFILE.maxSpeedCap, plan.id + ': ' + s.label);
        assert.ok(s.kind in KIND_LABEL, plan.id + ': rodzaj ' + s.kind);
        assert.ok(s.label, plan.id + ': odcinek bez nazwy');
      }
    }
  });

  test('każdy plan ma nazwę, poziom 1–3 i opis', () => {
    for (const p of PLANS) {
      assert.ok(p.name && p.desc && p.focus, p.id);
      assert.ok([1, 2, 3].includes(p.level), p.id);
    }
  });

  test('bez pochylni nachylenie jest zerowe, ale zamiar planu zostaje', () => {
    const plan = { id: 'x', segments: [{ t: 60, s: 'walk', i: 6, kind: 'work', label: 'Pod górę' }] };
    const [s] = resolvePlan(plan, { ...DEFAULT_PROFILE, maxInclineCap: 0 }).segments;
    assert.equal(s.incline, 0);
    assert.equal(s.wantedIncline, 6);
  });

  test('plan z FitShow trwa 30 minut i ma prędkości niezależne od profilu', () => {
    const plan = planById('fitshow-fat-30');
    const wolny = resolvePlan(plan, { ...DEFAULT_PROFILE, easy: 6, fast: 8 });
    const szybki = resolvePlan(plan, { ...DEFAULT_PROFILE, easy: 10, fast: 14, maxSpeedCap: 16 });
    assert.equal(wolny.totalSeconds, 30 * 60);
    assert.deepEqual(wolny.segments.map((s) => s.speed), szybki.segments.map((s) => s.speed));
    assert.deepEqual([...new Set(wolny.segments.map((s) => s.speed))].sort((a, b) => a - b), [3.5, 4.5, 5, 8, 9]);
  });

  test('limit prędkości przycina także prędkości wpisane liczbą', () => {
    const r = resolvePlan(planById('fitshow-fat-30'), { ...DEFAULT_PROFILE, maxSpeedCap: 7 });
    assert.equal(Math.max(...r.segments.map((s) => s.speed)), 7);
  });

  test('plany rosną razem z formą', () => {
    const plan = planById('easy-30');
    const przed = resolvePlan(plan, DEFAULT_PROFILE).estDistanceKm;
    const po = resolvePlan(plan, { ...DEFAULT_PROFILE, easy: 9, fast: 11.5 }).estDistanceKm;
    assert.ok(po > przed);
  });
});

describe('anchorSpeed', () => {
  test('kotwice idą rosnąco od spaceru do sprintu', () => {
    const p = { ...DEFAULT_PROFILE, maxSpeedCap: 20 };
    const v = KOTWICE.map((k) => anchorSpeed(k, p));
    for (let i = 1; i < v.length; i++) assert.ok(v[i] > v[i - 1], KOTWICE[i - 1] + ' < ' + KOTWICE[i]);
  });

  test('„swobodnie" i „VO2max" to dokładnie wartości z profilu', () => {
    assert.equal(anchorSpeed('easy', DEFAULT_PROFILE), DEFAULT_PROFILE.easy);
    assert.equal(anchorSpeed('vo2', DEFAULT_PROFILE), DEFAULT_PROFILE.fast);
  });

  test('żadna kotwica nie przekracza limitu', () => {
    for (const k of KOTWICE) assert.ok(anchorSpeed(k, DEFAULT_PROFILE) <= DEFAULT_PROFILE.maxSpeedCap, k);
  });

  test('spacer nie schodzi poniżej 2 km/h', () => {
    assert.equal(anchorSpeed('stroll', { ...DEFAULT_PROFILE, walk: 2.5 }), 2);
  });

  test('wynik jest zaokrąglony do dziesiątej części', () => {
    for (const k of KOTWICE) {
      const v = anchorSpeed(k, { ...DEFAULT_PROFILE, easy: 7.33, fast: 10.77 });
      assert.equal(Math.round(v * 10) / 10, v, k);
    }
  });

  test('nieznana kotwica to błąd', () => {
    assert.throws(() => anchorSpeed('turbo', DEFAULT_PROFILE), /Nieznana kotwica/);
  });
});

describe('fmtTime', () => {
  test('minuty i sekundy', () => {
    assert.equal(fmtTime(0), '0:00');
    assert.equal(fmtTime(65), '1:05');
    assert.equal(fmtTime(1800), '30:00');
  });
  test('godziny, gdy trening jest dłuższy', () => {
    assert.equal(fmtTime(3661), '1:01:01');
  });
  test('ujemny czas pokazuje zero, ułamki się zaokrąglają', () => {
    assert.equal(fmtTime(-5), '0:00');
    assert.equal(fmtTime(59.6), '1:00');
  });
});

test('cooperVo2 według wzoru Coopera', () => {
  assert.equal(cooperVo2(2400), 42.4);
  assert.equal(cooperVo2(504.9), 0);
});
