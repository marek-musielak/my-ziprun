// Wykresy i listy odcinków rysowane jako HTML — wspólne dla listy planów,
// szczegółów, kreatora, podsumowania i historii.

import { fmtTime } from '../plans.js';
import { esc } from '../tekst.js';

export function listaSegmentow(segments) {
  return segments
    .map((s) => {
      // Wszystko, co idzie do HTML, przez esc — także rodzaj i nachylenie.
      // Plany sprawdza już storage.js, ale rysunek nie może na tym polegać.
      const inc = s.incline > 0 ? ' · ' + esc(s.incline) + '%'
                : s.wantedIncline > 0 ? ' · <s>' + esc(s.wantedIncline) + '%</s>'
                : '';
      return '<div class="seg ' + esc(s.kind) + '"><i></i>' +
      '<div class="nm">' + esc(s.label) + inc + '</div>' +
      '<div class="sp">' + s.speed.toFixed(1).replace('.', ',') + '</div>' +
      '<div class="tm">' + fmtTime(s.duration) + '</div></div>';
    })
    .join('');
}

export function chartHtml(segments, maxSpeed) {
  // Szerokość słupka proporcjonalna do czasu, wysokość do prędkości.
  // Słupek dostaje udział w wolnym miejscu (flex-grow = czas, podstawa 0),
  // a nie procent całości: przy kilkudziesięciu słupkach odstępy po 1 px
  // wypychały sumę procentów poza kartę i ostatni odcinek — schłodzenie —
  // był ucinany. Minimalną szerokość, żeby krótki odcinek został widoczny,
  // daje CSS (min-width).
  return segments
    .map((s) => {
      const h = Math.max(4, Math.round((s.speed / maxSpeed) * 100));
      return '<div class="bar ' + esc(s.kind) + '" style="height:' + h + '%;flex:' + s.duration + ' 1 0" ' +
             'title="' + esc(s.label) + ' — ' + esc(s.speed) + ' km/h"></div>';
    })
    .join('');
}

// Kolejność i nazwy w legendzie — jak na wykresie od rozgrzewki do schłodzenia.
const LEGENDA = [
  ['warmup', 'rozgrzewka'], ['work', 'praca'], ['sprint', 'sprint'],
  ['recovery', 'przerwa'], ['cooldown', 'schłodzenie'],
];

/** Legenda tylko z rodzajów, które naprawdę są w planie — bez „pracy", gdy jej nie ma. */
export function legendaHtml(segments) {
  const sa = new Set(segments.map((s) => s.kind));
  return LEGENDA.filter(([kind]) => sa.has(kind))
    .map(([kind, nazwa]) => '<span><i class="sw ' + kind + '"></i>' + nazwa + '</span>')
    .join('');
}

/**
 * Półgodzinny trening daje ponad trzysta próbek, a w karcie mieści się około
 * stu dwudziestu słupków — flexbox nie ściśnie ich poniżej piksela, więc bez
 * uśrednienia wykres wylewał się poza ekran. Kubełkujemy do stałej liczby
 * słupków, zachowując kształt przebiegu.
 */
export function downsample(values, maxBars = 120) {
  if (values.length <= maxBars) return values;
  const size = values.length / maxBars;
  return Array.from({ length: maxBars }, (_, i) => {
    const from = Math.floor(i * size);
    const to = Math.max(from + 1, Math.floor((i + 1) * size));
    const bucket = values.slice(from, to).filter((v) => v != null);
    return bucket.length ? bucket.reduce((a, b) => a + b, 0) / bucket.length : 0;
  });
}
