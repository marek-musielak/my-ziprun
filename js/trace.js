// Zapis techniczny treningu.
//
// Rejestrator jest czystym obserwatorem — podłącza się do zdarzeń, które
// bieżnia i silnik już emitują, i nie wymaga żadnych zmian w ich środku.
// Dzięki temu nie da się nim zepsuć samego treningu.
//
// Zbiera dwie rzeczy: strumień zdarzeń (komendy, odpowiedzi, przejścia
// segmentów, ostrzeżenia) oraz przebieg pomiarów. Po treningu wszystko można
// wyeksportować do pliku tekstowego.

import { STATE } from './engine.js';

const CAP = 20000;          // twardy limit wpisów, żeby nie zjeść pamięci
const METRIC_MIN_GAP_MS = 900; // pomiary rzadziej niż raz na sekundę nie mają sensu

/**
 * Czeka, aż rejestrator się zamknie. Po komendzie zatrzymania pas hamuje
 * jeszcze kilka sekund i te sekundy też są zapisywane — plik pobrany
 * wcześniej urywa się w połowie hamowania, bez potwierdzenia, że bieżnia
 * w ogóle stanęła. Zwraca true, jeśli zapis zdążył się domknąć.
 */
export async function poczekajNaKoniecZapisu(trace, maxMs = 20000, krokMs = 300) {
  const koniec = Date.now() + maxMs;
  while (trace.recording && Date.now() < koniec) {
    await new Promise((r) => setTimeout(r, krokMs));
  }
  return !trace.recording;
}

export class Trace {
  constructor() {
    this.events = [];
    this.metrics = [];
    this.t0 = null;
    this.meta = {};
    this._lastMetricTs = 0;
    this.recording = false;
  }

  start(meta = {}) {
    this.events = [];
    this.metrics = [];
    this.t0 = Date.now();
    this.meta = { ...meta, start: new Date().toISOString() };
    this._lastMetricTs = 0;
    this.recording = true;
    this.add('trace', 'Rozpoczęto zapis techniczny');
  }

  stop() {
    if (!this.recording) return;
    this.add('trace', 'Zakończono zapis techniczny');
    this.recording = false;
  }

  get elapsed() { return this.t0 ? (Date.now() - this.t0) / 1000 : 0; }

  add(kind, text) {
    if (!this.recording) return;
    if (this.events.length >= CAP) this.events.shift();
    this.events.push({ t: this.elapsed, kind, text: String(text) });
  }

  /**
   * Pomiary przychodzą kilka razy na sekundę. Zapisujemy co najwyżej raz na
   * sekundę, ale każdą zmianę prędkości bierzemy natychmiast — to ona jest
   * najciekawsza przy analizie, czy bieżnia posłuchała komendy.
   */
  metric(row) {
    if (!this.recording) return;
    const now = Date.now();
    const last = this.metrics[this.metrics.length - 1];
    const speedChanged = !last || last.speed !== row.speed;
    if (!speedChanged && now - this._lastMetricTs < METRIC_MIN_GAP_MS) return;
    this._lastMetricTs = now;
    if (this.metrics.length >= CAP) this.metrics.shift();
    this.metrics.push({
      // t liczy się od naciśnięcia Start, workout od chwili, gdy pas ruszył —
      // różnica między nimi to odliczanie konsoli bieżni.
      t: Math.round(this.elapsed * 10) / 10,
      ...row,
    });
  }

  /** Podłącza rejestrator do bieżni i silnika. Zwraca sam siebie. */
  attach(treadmill, engine) {
    treadmill.on('log', (e) => this.add('ble', e.msg));
    treadmill.on('state', (e) => this.add('połączenie', e.state + (e.driver ? ' (' + e.driver + ')' : '')));
    treadmill.on('status', (s) => this.add('bieżnia', s.text + '  [' + s.raw + ']'));
    treadmill.on('frame', (f) => this.add('ramka', (f.char || f.uuid || '').slice(4, 8) + '  ' + f.hex));

    // Pomiary bierzemy z taktów silnika, nie ze zdarzeń bieżni. Takt jest
    // zawsze — także w trybie prowadzenia, gdy nic nie jest połączone — więc
    // zapis nigdy nie zostaje bez tabeli pomiarów.
    engine.on('tick', (d) => {
      if (!d || d.countdown != null || !d.segment) return;
      const m = d.metrics || {};
      this.metric({
        workout: Math.round(d.totalElapsed * 10) / 10,
        speed: m.speed ?? null,
        target: d.targetSpeed ?? null,
        distance: Math.round(d.distanceM),
        kcal: m.kcal ?? null,
        hr: m.hr || null,
        incline: m.incline ?? d.targetIncline ?? null,
        segment: d.segment.label,
      });
    });
    // Poza taktami silnika — przed startem i po zakończeniu — nikt inny nie
    // zapisze pomiarów, a właśnie wtedy widać, czy pas faktycznie zwolnił
    // do zera. Bieżnia hamuje kilka sekund po komendzie zatrzymania.
    treadmill.on('data', (m) => {
      if (engine.state === STATE.RUNNING) return;
      this.metric({
        workout: null,
        speed: m.speed ?? null,
        target: null,
        distance: m.distance ?? null,
        kcal: m.kcal ?? null,
        hr: m.hr || null,
        incline: m.incline ?? null,
        segment: engine.state === STATE.IDLE ? '(przed startem)' : '(po treningu)',
      });
    });

    engine.on('state', (s) => this.add('trening', 'stan: ' + s));
    // Prędkość zadaną bierzemy z silnika, a nie z planu. Po przejęciu tempa
    // z panelu bieżni te dwie liczby się różnią, a log ma mówić, co aplikacja
    // naprawdę zamówiła — inaczej sam siebie by prostował.
    engine.on('segment', (e) => {
      const cel = engine.targetSpeedFor(e.segment);
      const plan = e.segment.speed;
      const opis = Math.abs(cel - plan) < 0.05
        ? cel.toFixed(1) + ' km/h'
        : cel.toFixed(1) + ' km/h (plan ' + plan.toFixed(1) + ')';
      this.add('segment', '#' + (e.index + 1) + ' ' + e.segment.label +
        ' → ' + opis + ', ' + e.segment.duration + ' s');
    });
    engine.on('msg', (m) => this.add('uwaga', m));
    return this;
  }

  /** Raport tekstowy: nagłówek, strumień zdarzeń, tabela pomiarów w CSV. */
  toText(extra = {}) {
    const L = [];
    const pad = (t) => (Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0')).padStart(7);
    L.push('=== ZAPIS TECHNICZNY TRENINGU (ZipRun) ===');
    for (const [k, v] of Object.entries({ ...this.meta, ...extra })) L.push(k + ': ' + v);
    L.push('zdarzeń: ' + this.events.length + ', pomiarów: ' + this.metrics.length);
    L.push('');
    L.push('--- ZDARZENIA ---');
    for (const e of this.events) L.push(pad(e.t) + '  [' + e.kind + '] ' + e.text);
    L.push('');
    L.push('--- POMIARY (CSV) ---');
    L.push('czas_s liczony od nacisniecia Start, workout_s od chwili ruszenia pasa.');
    L.push('czas_s;workout_s;predkosc_kmh;cel_kmh;dystans_m;kcal;puls;nachylenie;odcinek');
    for (const m of this.metrics) {
      L.push([m.t, m.workout, m.speed, m.target, m.distance, m.kcal, m.hr, m.incline, m.segment]
        .map((x) => (x === null || x === undefined ? '' : x)).join(';'));
    }
    // Znak nowej linii na końcu — bez niego ostatni pomiar sklejał się z tym,
    // co po nim wypisze konsola albo następny plik przy sklejaniu.
    return L.join('\n') + '\n';
  }

  /**
   * Wersja do zapisania w pamięci przeglądarki. Pomiary zostają w całości,
   * zdarzenia obcinamy do ostatnich 1500 — przy dłuższym treningu to i tak
   * więcej, niż da się przeczytać, a localStorage ma około 5 MB na wszystko.
   */
  toStored() {
    return {
      meta: this.meta,
      events: this.events.slice(-1500),
      metrics: this.metrics,
    };
  }

  static fromStored(obj) {
    const t = new Trace();
    t.meta = obj.meta || {};
    t.events = obj.events || [];
    t.metrics = obj.metrics || [];
    return t;
  }
}
