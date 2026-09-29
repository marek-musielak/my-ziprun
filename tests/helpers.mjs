// Atrapy tego, czego Node nie ma, a aplikacja potrzebuje: localStorage,
// zegar dla silnika treningu i bieżnia, która tylko zapamiętuje komendy.

/**
 * localStorage w pamięci. Opcjonalny limit rozmiaru udaje zapełnioną pamięć
 * przeglądarki — setItem rzuca wtedy wyjątek, tak jak w Chrome.
 */
export function instalujLocalStorage({ limitZnakow = Infinity } = {}) {
  const dane = new Map();
  const ls = {
    getItem: (k) => (dane.has(k) ? dane.get(k) : null),
    setItem: (k, v) => {
      const s = String(v);
      if (s.length > limitZnakow) throw new Error('QuotaExceededError');
      dane.set(k, s);
    },
    removeItem: (k) => dane.delete(k),
    clear: () => dane.clear(),
    get length() { return dane.size; },
  };
  globalThis.localStorage = ls;
  return ls;
}

/**
 * Silnik liczy czas z performance.now(). Podmieniamy go na zegar, który
 * stoi, dopóki test go nie przesunie — takty są wtedy powtarzalne co do
 * milisekundy, a test trwa ułamek sekundy zamiast pół godziny.
 */
export function instalujZegar() {
  let teraz = 1000;
  Object.defineProperty(globalThis, 'performance', {
    value: { now: () => teraz },
    configurable: true,
    writable: true,
  });
  return {
    przesun(ms) { teraz += ms; },
    get teraz() { return teraz; },
  };
}

/** Bieżnia bez Bluetooth: zapisuje komendy i pozwala wstrzykiwać zdarzenia. */
export class SztucznaBieznia {
  constructor({ speed = true, incline = false } = {}) {
    this.caps = {
      speed,
      incline,
      speedRange: { min: 1, max: 12 },
      inclineRange: { min: 0, max: 0 },
    };
    this.metrics = {};
    this.targetSpeed = 0;
    this.connected = true;
    this.komendy = [];
    this.przejeta = null;
    this._cb = {};
  }

  on(evt, cb) { (this._cb[evt] ||= []).push(cb); return this; }
  emit(evt, p) { for (const cb of this._cb[evt] || []) cb(p); }

  async start() { this.komendy.push(['start']); }
  async rampTo(v) { this.komendy.push(['rampTo', v]); this.targetSpeed = v; }
  stopRamp() { this.komendy.push(['stopRamp']); }
  async stopBelt() { this.komendy.push(['stopBelt']); }
  async pauseBelt() { this.komendy.push(['pauseBelt']); }
  async setIncline(v) { this.komendy.push(['setIncline', v]); }
  adoptSpeed(v) { this.przejeta = v; this.targetSpeed = v; }

  /** Same komendy prędkości, w kolejności wysłania. */
  get rampy() { return this.komendy.filter((k) => k[0] === 'rampTo').map((k) => k[1]); }
}

/** Czeka, aż dokończą się obietnice rozpoczęte w bieżącym takcie. */
export const dokonczObietnice = () => new Promise((r) => setImmediate(r));
