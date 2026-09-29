// Generator własnych planów.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TYPY, INTENSYWNOSCI, MIN_MINUT, MAX_MINUT, generujPlan, rozdziel, kotwicaRam, opisBudowy,
} from '../js/generator.js';
import { resolvePlan, DEFAULT_PROFILE } from '../js/plans.js';

// Wszystkie długości co 5 minut i kilka nieokrągłych — nieokrągłe psują
// dzielenie najłatwiej.
const DLUGOSCI = [
  ...Array.from({ length: (MAX_MINUT - MIN_MINUT) / 5 + 1 }, (_, i) => MIN_MINUT + i * 5),
  11, 13, 17, 23, 33, 47, 59, 71, 89,
];

const wszystkieKombinacje = () =>
  TYPY.flatMap((t) => INTENSYWNOSCI.flatMap((i) => DLUGOSCI.map((minuty) =>
    ({ typ: t.id, intensywnosc: i.id, minuty }))));

describe('rozdziel', () => {
  test('suma kawałków jest równa całości co do sekundy', () => {
    for (const czas of [60, 61, 599, 600, 1234, 3600]) {
      for (const n of [1, 2, 3, 7, 10, 20]) {
        const k = rozdziel(czas, n);
        assert.equal(k.reduce((a, b) => a + b, 0), czas, czas + ' / ' + n);
        assert.equal(k.length, n);
      }
    }
  });

  test('nadmiar rozkłada się po kawałkach, a nie ląduje na ostatnim', () => {
    const k = rozdziel(1234, 10);
    assert.ok(Math.max(...k) - Math.min(...k) <= 10, k.join(','));
  });

  test('nie tworzy więcej kawałków niż sekund', () => {
    assert.deepEqual(rozdziel(3, 10), [1, 1, 1]);
  });
});

describe('generujPlan', () => {
  test('plan trwa dokładnie tyle, ile zamówiono — każda kombinacja', () => {
    for (const k of wszystkieKombinacje()) {
      const plan = generujPlan(k);
      const suma = plan.segments.reduce((a, s) => a + s.t, 0);
      assert.equal(suma, k.minuty * 60, JSON.stringify(k));
    }
  });

  test('każdy odcinek ma całkowitą, dodatnią długość', () => {
    for (const k of wszystkieKombinacje()) {
      for (const s of generujPlan(k).segments) {
        assert.ok(Number.isInteger(s.t) && s.t > 0, JSON.stringify(k) + ' ' + s.t);
      }
    }
  });

  test('zaczyna się rozgrzewką i kończy schłodzeniem', () => {
    for (const k of wszystkieKombinacje()) {
      const s = generujPlan(k).segments;
      assert.equal(s[0].kind, 'warmup', JSON.stringify(k));
      assert.equal(s.at(-1).kind, 'cooldown', JSON.stringify(k));
    }
  });

  test('rozgrzewka jest wolniejsza niż najlżejszy odcinek treningu', () => {
    for (const k of wszystkieKombinacje()) {
      const r = resolvePlan(generujPlan(k), DEFAULT_PROFILE);
      const rdzen = r.segments.slice(1, -1).map((s) => s.speed);
      assert.ok(r.segments[0].speed < Math.min(...rdzen), JSON.stringify(k));
      assert.ok(r.segments[0].speed <= DEFAULT_PROFILE.walk, 'rozgrzewka nigdy szybsza niż marsz');
    }
  });

  test('przerwa pojawia się tylko w interwałach', () => {
    for (const k of wszystkieKombinacje()) {
      const przerwy = generujPlan(k).segments.filter((s) => s.kind === 'recovery');
      if (k.typ === 'interwaly') assert.ok(przerwy.length > 0, JSON.stringify(k));
      else assert.equal(przerwy.length, 0, JSON.stringify(k));
    }
  });

  test('przerwa w interwałach trwa co najmniej 30 sekund', () => {
    for (const k of wszystkieKombinacje().filter((x) => x.typ === 'interwaly')) {
      for (const s of generujPlan(k).segments.filter((x) => x.kind === 'recovery')) {
        assert.ok(s.t >= 30, JSON.stringify(k) + ' przerwa ' + s.t);
      }
    }
  });

  test('długość spoza zakresu jest przycinana', () => {
    assert.equal(generujPlan({ typ: 'fat', intensywnosc: 'srednia', minuty: 3 }).generator.minuty, MIN_MINUT);
    assert.equal(generujPlan({ typ: 'fat', intensywnosc: 'srednia', minuty: 500 }).generator.minuty, MAX_MINUT);
  });

  test('nieznany typ albo intensywność to błąd, a nie pusty plan', () => {
    assert.throws(() => generujPlan({ typ: 'x', intensywnosc: 'srednia', minuty: 30 }));
    assert.throws(() => generujPlan({ typ: 'fat', intensywnosc: 'x', minuty: 30 }));
  });

  test('identyfikatory są unikalne nawet w jednej milisekundzie', () => {
    const id = new Set(Array.from({ length: 500 }, () =>
      generujPlan({ typ: 'fat', intensywnosc: 'srednia', minuty: 30 }).id));
    assert.equal(id.size, 500);
  });

  test('własna nazwa jest przycinana, pusta daje nazwę domyślną', () => {
    const k = { typ: 'interwaly', intensywnosc: 'mocna', minuty: 25 };
    assert.equal(generujPlan({ ...k, nazwa: '  Poniedziałek  ' }).name, 'Poniedziałek');
    assert.equal(generujPlan({ ...k, nazwa: '   ' }).name, 'Interwały 25 min');
  });

  test('marsz łagodny to jeden równy blok, bez udawanej fali', () => {
    const s = generujPlan({ typ: 'marsz', intensywnosc: 'lagodna', minuty: 40 }).segments;
    assert.equal(s.length, 3);
    assert.equal(s[1].label, 'Marsz');
  });

  test('plan narastający kończy się najszybszym stopniem', () => {
    const r = resolvePlan(generujPlan({ typ: 'narastajacy', intensywnosc: 'mocna', minuty: 40 }), DEFAULT_PROFILE);
    const rdzen = r.segments.slice(1, -1).map((s) => s.speed);
    for (let i = 1; i < rdzen.length; i++) assert.ok(rdzen[i] >= rdzen[i - 1], rdzen.join(' → '));
    assert.equal(rdzen.at(-1), Math.max(...rdzen));
  });
});

describe('kotwicaRam', () => {
  test('przed biegiem rozgrzewką jest marsz, nie trucht', () => {
    assert.equal(kotwicaRam([{ s: 'jog' }, { s: 'tempo' }]), 'walk');
  });
  test('przed marszem rozgrzewką jest spacer', () => {
    assert.equal(kotwicaRam([{ s: 'walk' }]), 'stroll');
  });
  test('prędkości liczbowe nie psują wyboru', () => {
    assert.equal(kotwicaRam([{ s: 8.0 }]), 'walk');
  });
});

test('opisBudowy liczy odcinki, minuty i udział pracy', () => {
  const o = opisBudowy(generujPlan({ typ: 'wytrzymalosc', intensywnosc: 'srednia', minuty: 30 }));
  assert.equal(o.odcinkow, 3);
  assert.equal(o.minut, 30);
  assert.ok(o.pracaProc > 50 && o.pracaProc < 100);
});
