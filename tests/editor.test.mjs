// Edytor planów i link, którym plan jedzie na telefon.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/editor/model.js';
import { zakoduj, odkoduj, adresPlanu, PREFIKS } from '../js/editor/link.js';
import { resolvePlan, DEFAULT_PROFILE } from '../js/plans.js';

const odc = (kind, v, i, t) => ({ kind, v: String(v), i: String(i), t: String(t) });
const plan = (...elementy) => ({ id: 'edytor-test-1', nazwa: 'Plan testowy', elementy });

describe('pola', () => {
  test('czas: z dwukropkiem minuty i sekundy, bez niego sekundy', () => {
    assert.equal(m.parsujCzas('1:30'), 90);
    assert.equal(m.parsujCzas('90'), 90);
    assert.equal(m.parsujCzas('30:00'), 1800);
    assert.equal(m.parsujCzas(' 1:05 '), 65);
    assert.equal(m.parsujCzas('120:00'), 7200);
  });

  test('czas: błędne wpisy są odrzucane', () => {
    for (const zly of ['', '1:75', '1:', ':30', 'abc', '1.5', '-30', '1:30:00', '9']) {
      assert.equal(m.parsujCzas(zly), null, JSON.stringify(zly));
    }
  });

  test('czas: co najmniej 10 sekund', () => {
    assert.equal(m.parsujCzas('10'), 10);
    assert.equal(m.parsujCzas('0:09'), null);
  });

  test('prędkość: 1–22 km/h co 0,1, przecinek albo kropka', () => {
    assert.equal(m.parsujPredkosc('9'), 9);
    assert.equal(m.parsujPredkosc('9,5'), 9.5);
    assert.equal(m.parsujPredkosc('9.5'), 9.5);
    assert.equal(m.parsujPredkosc('22'), 22);
    assert.equal(m.parsujPredkosc('1'), 1);
    for (const zly of ['0.9', '22.1', '9.55', '', 'x', '-5']) assert.equal(m.parsujPredkosc(zly), null, zly);
  });

  test('nachylenie: 0–20 % w pełnych procentach', () => {
    assert.equal(m.parsujNachylenie('0'), 0);
    assert.equal(m.parsujNachylenie('20'), 20);
    for (const zly of ['21', '2.5', '-1', 'x']) assert.equal(m.parsujNachylenie(zly), null, zly);
  });

  test('nachylenie: puste pole to 0 %', () => {
    assert.equal(m.parsujNachylenie(''), 0);
    assert.equal(m.parsujNachylenie('   '), 0);
    const w = m.przelicz(plan(odc('work', 9, '', 60)));
    assert.equal(w.ok, true);
    assert.equal(w.plan.elementy[0].i, 0);
  });

  test('powtórzenia grupy: 1–50', () => {
    assert.equal(m.parsujPowtorzenia('1'), 1);
    assert.equal(m.parsujPowtorzenia('50'), 50);
    assert.equal(m.parsujPowtorzenia('0'), null);
    assert.equal(m.parsujPowtorzenia('51'), null);
  });
});

describe('nowy plan', () => {
  test('domyślna nazwa to data i godzina', () => {
    assert.equal(m.domyslnaNazwa(new Date(2026, 8, 29, 21, 5)), 'Plan 29 wrz 2026 21:05');
    assert.equal(m.domyslnaNazwa(new Date(2026, 9, 3, 7, 9)), 'Plan 03 paź 2026 07:09');
  });

  test('zaczyna się rozgrzewką: 30 min, 9 km/h, 0 %', () => {
    const p = m.nowyPlan();
    assert.deepEqual(p.elementy, [{ kind: 'warmup', v: '9', i: '0', t: '30:00' }]);
    assert.match(p.id, /^edytor-/);
  });

  test('każdy nowy plan ma inny identyfikator', () => {
    const id = new Set(Array.from({ length: 300 }, () => m.nowyPlan().id));
    assert.equal(id.size, 300);
  });
});

describe('operacje', () => {
  test('rodzaj przełącza się w kółko: praca → sprint → przerwa → schłodzenie → rozgrzewka', () => {
    let p = plan(odc('work', 9, 0, 60));
    const kolejne = [];
    for (let k = 0; k < 5; k++) { p = m.przelaczRodzaj(p, [0]); kolejne.push(p.elementy[0].kind); }
    assert.deepEqual(kolejne, ['sprint', 'recovery', 'cooldown', 'warmup', 'work']);
  });

  test('dodany odcinek przepisuje wartości z ostatniego, rodzaj: praca', () => {
    const p = m.dodajOdcinek(plan(odc('warmup', 9, 3, '30:00')));
    assert.deepEqual(p.elementy[1], { kind: 'work', v: '9', i: '3', t: '30:00' });
  });

  test('po grupie nowy odcinek bierze wartości z jej ostatniego odcinka', () => {
    const p = m.dodajOdcinek(plan({ r: '5', odcinki: [odc('work', 12, 0, 60), odc('recovery', 6, 2, 90)] }));
    assert.deepEqual(p.elementy[1], { kind: 'work', v: '6', i: '2', t: '90' });
  });

  test('w pustym planie dodaje się rozgrzewka startowa', () => {
    assert.deepEqual(m.dodajOdcinek(plan()).elementy, [m.PIERWSZY_ODCINEK]);
  });

  test('operacje nie zmieniają planu, na którym działają', () => {
    const p = plan(odc('work', 9, 0, 60));
    const przed = JSON.stringify(p);
    m.dodajOdcinek(p); m.duplikuj(p, [0]); m.usun(p, [0]); m.przelaczRodzaj(p, [0]); m.ustaw(p, [0], 'v', '10');
    assert.equal(JSON.stringify(p), przed);
  });

  test('duplikat ląduje tuż pod oryginałem — także w grupie', () => {
    const p = plan(odc('warmup', 5, 0, 60), { r: '2', odcinki: [odc('work', 10, 0, 60), odc('recovery', 6, 0, 60)] });
    assert.equal(m.duplikuj(p, [0]).elementy[1].kind, 'warmup');
    assert.deepEqual(m.duplikuj(p, [1, 0]).elementy[1].odcinki.map((o) => o.kind), ['work', 'work', 'recovery']);
  });

  test('usunięcie ostatniego odcinka grupy usuwa grupę', () => {
    const p = plan(odc('warmup', 5, 0, 60), { r: '3', odcinki: [odc('work', 10, 0, 60)] });
    assert.equal(m.usun(p, [1, 0]).elementy.length, 1);
  });

  test('grupować można tylko co najmniej dwa sąsiednie odcinki spoza grup', () => {
    const p = plan(odc('work', 9, 0, 60), odc('work', 10, 0, 60), odc('work', 11, 0, 60),
      { r: '2', odcinki: [odc('work', 9, 0, 60)] });
    assert.equal(m.moznaGrupowac(p, [0, 1]), true);
    assert.equal(m.moznaGrupowac(p, [2, 1, 0]), true, 'kolejność zaznaczania nie ma znaczenia');
    assert.equal(m.moznaGrupowac(p, [0]), false, 'jeden odcinek');
    assert.equal(m.moznaGrupowac(p, [0, 2]), false, 'nie sąsiednie');
    assert.equal(m.moznaGrupowac(p, [2, 3]), false, 'grupa w grupie');
  });

  test('grupa powstaje w miejscu odcinków, z jednym powtórzeniem', () => {
    const p = plan(odc('warmup', 5, 0, 60), odc('work', 12, 0, 60), odc('recovery', 6, 0, 90), odc('cooldown', 5, 0, 60));
    const g = m.grupuj(p, [1, 2]);
    assert.equal(g.elementy.length, 3);
    assert.equal(g.elementy[1].r, '1');
    assert.deepEqual(g.elementy[1].odcinki.map((o) => o.kind), ['work', 'recovery']);
    assert.equal(g.elementy[2].kind, 'cooldown');
  });

  test('rozgrupowanie zwraca odcinki w jednym egzemplarzu', () => {
    const p = plan(odc('warmup', 5, 0, 60), { r: '20', odcinki: [odc('work', 12, 0, 60), odc('recovery', 6, 0, 90)] });
    assert.deepEqual(m.rozgrupuj(p, 1).elementy.map((o) => o.kind), ['warmup', 'work', 'recovery']);
  });

  test('zmiana odcinka w grupie obejmuje wszystkie powtórzenia', () => {
    let p = plan({ r: '3', odcinki: [odc('work', 12, 0, 60)] });
    p = m.ustaw(p, [0, 0], 'v', '13');
    const { plan: liczby } = m.przelicz(p);
    assert.deepEqual(m.rozwin(liczby.elementy).map((o) => o.v), [13, 13, 13]);
  });
});

describe('przelicz', () => {
  test('poprawny plan: liczby i brak błędów', () => {
    const w = m.przelicz(plan(odc('warmup', '9,5', 0, '1:30')));
    assert.equal(w.ok, true);
    assert.deepEqual(w.plan.elementy[0], { kind: 'warmup', v: 9.5, i: 0, t: 90 });
  });

  test('błąd wskazuje dokładnie to pole, które trzeba poprawić', () => {
    const w = m.przelicz(plan(odc('work', 30, 0, 60), { r: '0', odcinki: [odc('work', 9, 0, '5')] }));
    assert.equal(w.ok, false);
    assert.deepEqual(Object.keys(w.bledy).sort(), ['0.v', '1.0.t', '1.r']);
  });

  test('pusta nazwa i pusty plan to błędy', () => {
    const w = m.przelicz({ id: 'edytor-x', nazwa: '  ', elementy: [] });
    assert.ok(w.bledy.nazwa);
    assert.ok(w.bledy.plan);
  });

  test('za dużo odcinków po rozwinięciu grup', () => {
    const odcinki = Array.from({ length: 21 }, () => odc('work', 9, 0, 10));
    const w = m.przelicz(plan({ r: '50', odcinki }));
    assert.match(w.bledy.plan, /1050 odcinków/);
  });
});

describe('plan dla aplikacji', () => {
  const liczbowy = () => m.przelicz(plan(
    odc('warmup', 9, 0, '5:00'),
    { r: '3', odcinki: [odc('work', 14, 4, 60), odc('recovery', 7, 0, 90)] },
    odc('cooldown', 6, 0, '3:00'),
  )).plan;

  test('grupy są rozwinięte, praca numerowana przez wszystkie powtórzenia', () => {
    const p = m.doPlanu(liczbowy());
    assert.deepEqual(p.segments.map((s) => s.label), [
      'Rozgrzewka', 'Praca 1', 'Przerwa', 'Praca 2', 'Przerwa', 'Praca 3', 'Przerwa', 'Schłodzenie',
    ]);
  });

  test('sprinty mają własną numerację, niezależną od prac', () => {
    const p = m.doPlanu(m.przelicz(plan(
      odc('warmup', 9, 0, 60),
      { r: '2', odcinki: [odc('work', 12, 0, 60), odc('sprint', 18, 0, 20), odc('recovery', 6, 0, 60)] },
    )).plan);
    assert.deepEqual(p.segments.map((s) => s.label), [
      'Rozgrzewka', 'Praca 1', 'Sprint 1', 'Przerwa', 'Praca 2', 'Sprint 2', 'Przerwa',
    ]);
  });

  test('prędkości wpisane liczbą — plan nie zależy od profilu', () => {
    const p = m.doPlanu(liczbowy());
    const wolny = resolvePlan(p, { ...DEFAULT_PROFILE, easy: 6, fast: 8 });
    const szybki = resolvePlan(p, { ...DEFAULT_PROFILE, easy: 10, fast: 14 });
    assert.deepEqual(wolny.segments.map((s) => s.speed), szybki.segments.map((s) => s.speed));
    assert.equal(wolny.totalSeconds, 300 + 3 * 150 + 180);
    assert.equal(wolny.segments[1].incline, 4);
  });

  test('plan własny, bez poziomu trudności', () => {
    const p = m.doPlanu(liczbowy());
    assert.equal(p.custom, true);
    assert.equal('level' in p, false);
  });
});

describe('podsumowanie i lista', () => {
  test('10 km na 20 % bieżni to 1 km w górę', () => {
    const s = m.podsumowanie([{ kind: 'work', v: 10, i: 20, t: 3600 }]);
    assert.equal(s.dystansKm, 10);
    assert.ok(Math.abs(s.przewyzszenieM - 1000) < 1e-9);
  });

  test('czas, dystans i liczba odcinków', () => {
    const s = m.podsumowanie([{ kind: 'warmup', v: 9, i: 0, t: 1800 }, { kind: 'work', v: 12, i: 0, t: 600 }]);
    assert.equal(s.czasS, 2400);
    assert.equal(s.dystansKm, 6.5);
    assert.equal(s.odcinkow, 2);
    assert.equal(s.przewyzszenieM, 0);
  });

  test('linia odcinka: czas, tempo na kilometr, nachylenie w terenie', () => {
    assert.equal(m.liniaOdcinka({ v: 9, i: 0, t: 1800 }), '30m00s [6:40] /0%');
    assert.equal(m.liniaOdcinka({ v: 10, i: 8, t: 240 }), '04m00s [6:00] /4%');
    assert.equal(m.liniaOdcinka({ v: 12, i: 5, t: 75 }), '01m15s [5:00] /2,5%');
    assert.equal(m.liniaOdcinka({ v: 22, i: 0, t: 30 }), '00m30s [2:44] /0%');
  });

  test('przeliczenie obok pola czasu', () => {
    assert.equal(m.opisCzasu(45), '45 s');
    assert.equal(m.opisCzasu(90), '1 min 30 s');
    assert.equal(m.opisCzasu(1800), '30 min');
  });
});

describe('link', () => {
  const liczbowy = () => m.przelicz({
    id: 'edytor-abc-1',
    nazwa: 'Podbiegi — środa',
    elementy: [odc('warmup', 9, 0, '10:00'), { r: '20', odcinki: [odc('work', 12.5, 6, 60), odc('recovery', 7, 0, 60)] }],
  }).plan;

  test('w obie strony bez strat, z polskimi znakami', () => {
    assert.deepEqual(odkoduj(zakoduj(liczbowy())), liczbowy());
  });

  test('grupa jedzie zwinięta — dwadzieścia powtórzeń nie wydłuża linku', () => {
    const jeden = zakoduj({ ...liczbowy(), elementy: [liczbowy().elementy[1]] });
    const zwiekszony = zakoduj({ ...liczbowy(), elementy: [{ ...liczbowy().elementy[1], r: 50 }] });
    assert.equal(zwiekszony.length, jeden.length);
    assert.ok(zakoduj(liczbowy()).length < 200);
  });

  test('dane są bezpieczne w adresie', () => {
    assert.match(zakoduj(liczbowy()), /^[A-Za-z0-9_-]+$/);
  });

  test('adres prowadzi do aplikacji, a plan siedzi po #', () => {
    const a = adresPlanu('https://marek-musielak.github.io/my-ziprun/', liczbowy());
    assert.ok(a.startsWith('https://marek-musielak.github.io/my-ziprun/' + PREFIKS));
  });

  const spreparowany = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const poprawny = () => ({ v: 1, id: 'edytor-x', n: 'Plan', e: [['work', 60, 9, 0]] });

  test('poprawnie spreparowany link przechodzi', () => {
    assert.equal(odkoduj(spreparowany(poprawny())).elementy.length, 1);
  });

  test('sprint przechodzi przez link', () => {
    const p = odkoduj(spreparowany({ ...poprawny(), e: [['sprint', 20, 18, 0]] }));
    assert.equal(p.elementy[0].kind, 'sprint');
  });

  test('uszkodzony albo obcy link jest odrzucany z wyjaśnieniem', () => {
    const zle = [
      'nie-base64!!', spreparowany('tekst'), spreparowany(null),
      spreparowany({ ...poprawny(), v: 2 }),
      spreparowany({ ...poprawny(), id: '<img src=x>' }),
      spreparowany({ ...poprawny(), n: '' }),
      spreparowany({ ...poprawny(), n: 'x'.repeat(61) }),
      spreparowany({ ...poprawny(), e: [] }),
      spreparowany({ ...poprawny(), e: [['turbo', 60, 9, 0]] }),
      spreparowany({ ...poprawny(), e: [['work', 5, 9, 0]] }),
      spreparowany({ ...poprawny(), e: [['work', 60, 30, 0]] }),
      spreparowany({ ...poprawny(), e: [['work', 60, 9.55, 0]] }),
      spreparowany({ ...poprawny(), e: [['work', 60, '9', 0]] }),
      spreparowany({ ...poprawny(), e: [['work', 60, 9, 25]] }),
      spreparowany({ ...poprawny(), e: [['work', 60, 9, 0, 'nadmiar']] }),
      spreparowany({ ...poprawny(), e: [{ r: 51, e: [['work', 60, 9, 0]] }] }),
      spreparowany({ ...poprawny(), e: [{ r: 2, e: [{ r: 2, e: [['work', 60, 9, 0]] }] }] }),
      spreparowany({ ...poprawny(), e: [{ r: 50, e: Array(21).fill(['work', 10, 9, 0]) }] }),
    ];
    for (const z of zle) assert.throws(() => odkoduj(z), /Link do planu jest uszkodzony/, z);
  });

  test('nazwa z kodem HTML przechodzi jako zwykły tekst, znaki sterujące znikają', () => {
    const p = odkoduj(spreparowany({ ...poprawny(), n: '<b>Plan</b>\u0007' }));
    assert.equal(p.nazwa, '<b>Plan</b>');
  });

  test('nazwy odcinków z linku są ignorowane — telefon nadaje je sam', () => {
    const p = m.doPlanu(odkoduj(spreparowany({ ...poprawny(), e: [['work', 60, 9, 0]], labels: ['<script>'] })));
    assert.equal(p.segments[0].label, 'Praca 1');
  });
});
