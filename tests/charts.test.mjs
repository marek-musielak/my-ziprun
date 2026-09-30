// Wykresy rysowane jako HTML.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { downsample, chartHtml, listaSegmentow } from '../js/ui/charts.js';

describe('downsample', () => {
  test('krótki przebieg zostaje bez zmian', () => {
    const v = [1, 2, 3];
    assert.equal(downsample(v, 120), v);
  });

  test('długi przebieg mieści się w zadanej liczbie słupków', () => {
    const v = Array.from({ length: 361 }, (_, i) => i);
    assert.equal(downsample(v, 120).length, 120);
  });

  test('stała prędkość zostaje stałą prędkością', () => {
    const wynik = downsample(Array(500).fill(8), 60);
    assert.ok(wynik.every((x) => x === 8));
  });

  test('brakujące pomiary nie zaniżają średniej', () => {
    const v = Array.from({ length: 240 }, (_, i) => (i % 2 ? null : 6));
    assert.ok(downsample(v, 120).every((x) => x === 6));
  });

  test('kształt przebiegu zostaje — wolno, szybko, wolno', () => {
    const v = [...Array(100).fill(5), ...Array(100).fill(10), ...Array(100).fill(5)];
    const w = downsample(v, 30);
    assert.equal(w[0], 5);
    assert.equal(w[15], 10);
    assert.equal(w[29], 5);
  });
});

const ODCINKI = [
  { kind: 'warmup', label: 'Rozgrzewka', speed: 5, duration: 300, incline: 0, wantedIncline: 0 },
  { kind: 'work', label: 'Bieg', speed: 10, duration: 600, incline: 0, wantedIncline: 4 },
  { kind: 'cooldown', label: 'Schłodzenie', speed: 5, duration: 300, incline: 0, wantedIncline: 0 },
];

describe('chartHtml', () => {
  test('jeden słupek na odcinek, szerokość proporcjonalna do czasu', () => {
    const html = chartHtml(ODCINKI, 10);
    const szer = [...html.matchAll(/flex:0 0 ([\d.]+)%/g)].map((m) => +m[1]);
    assert.deepEqual(szer, [25, 50, 25]);
  });

  test('wysokość proporcjonalna do prędkości', () => {
    const wys = [...chartHtml(ODCINKI, 10).matchAll(/height:(\d+)%/g)].map((m) => +m[1]);
    assert.deepEqual(wys, [50, 100, 50]);
  });

  test('bardzo krótki odcinek zostaje widoczny', () => {
    const html = chartHtml([{ ...ODCINKI[1], duration: 1 }, { ...ODCINKI[0], duration: 5000 }], 10);
    assert.match(html, /flex:0 0 0\.4%/);
  });
});

describe('listaSegmentow', () => {
  test('prędkość z przecinkiem i czas odcinka', () => {
    const html = listaSegmentow([{ ...ODCINKI[0], speed: 5.5 }]);
    assert.match(html, /<div class="sp">5,5<\/div>/);
    assert.match(html, /<div class="tm">5:00<\/div>/);
  });

  test('podbieg, którego bieżnia nie ustawi, jest przekreślony', () => {
    assert.match(listaSegmentow([ODCINKI[1]]), /<s>4%<\/s>/);
  });
});

describe('bezpieczny HTML', () => {
  const zly = { kind: 'work"><img src=x onerror=alert(1)>', label: '<script>x</script>', speed: 9, duration: 60, incline: 0, wantedIncline: 0 };

  test('wykres nie wstawia znaczników z danych', () => {
    const html = chartHtml([zly], 10);
    assert.doesNotMatch(html, /<img|<script/);
    assert.match(html, /&quot;&gt;&lt;img/);
  });

  test('lista odcinków nie wstawia znaczników z danych', () => {
    assert.doesNotMatch(listaSegmentow([zly]), /<img|<script/);
  });
});
