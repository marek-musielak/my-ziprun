// Sterownik dla bieżni, które NIE udostępniają standardu FTMS.
//
// Bieżnie obsługiwane przez FitShow bardzo często używają własnościowego
// protokołu na usłudze 0xFFF0 (notyfikacje 0xFFF1, zapis 0xFFF2) albo na
// Nordic UART. Ramka ma zwykle postać:
//
//     0x02 | LEN | CMD | DATA... | CHECKSUM | 0x03
//
// gdzie CHECKSUM to XOR wybranego zakresu bajtów. Dokładne numery komend
// różnią się między producentami i NIE są udokumentowane publicznie, dlatego
// ten sterownik:
//   1. sam znajduje kanał zapisu i kanał notyfikacji,
//   2. loguje każdą ramkę przychodzącą (zakładka Diagnostyka),
//   3. pozwala wysłać dowolną ramkę ręcznie i zapisać działający szablon.
//
// Po sesji diagnostycznej wystarczy wpisać poprawne opcode'y do OPCODES
// poniżej — reszta aplikacji korzysta z tego samego interfejsu co FTMS.

import { PROPRIETARY, hex } from './uuids.js';

const START = 0x02;
const END = 0x03;

/** Warianty liczenia sumy kontrolnej - do sprawdzenia eksperymentalnie. */
export const CHECKSUM_VARIANTS = {
  // XOR bajtów od LEN do końca DATA (najczęstszy wariant FitShow)
  xorLenData: (len, cmd, data) => [len, cmd, ...data].reduce((a, b) => a ^ b, 0),
  // XOR bajtów od CMD do końca DATA
  xorCmdData: (len, cmd, data) => [cmd, ...data].reduce((a, b) => a ^ b, 0),
  // Suma modulo 256
  sum: (len, cmd, data) => [len, cmd, ...data].reduce((a, b) => a + b, 0) & 0xff,
};

/**
 * Opcode'y do UZUPEŁNIENIA po diagnostyce. Wartości poniżej to najczęściej
 * raportowane w projektach reverse-engineeringu FitShow, ale traktuj je jako
 * hipotezę, nie fakt - dopóki nie potwierdzisz ich na swojej bieżni.
 */
export const OPCODES = {
  handshake: 0xa0,   // zapytanie o info o urządzeniu
  status: 0xa1,      // odpytanie o stan
  control: 0xa2,     // start / stop / pauza
  setTarget: 0xa3,   // ustawienie prędkości i nachylenia
  data: 0xb1,        // ramka z danymi przychodzącymi
};

export class ProprietaryDriver {
  name = 'Protokół własnościowy';

  constructor() {
    this.service = null;
    this.writeChar = null;
    this.notifyChars = [];
    this.checksumVariant = 'xorLenData';
    this.speedRange = { min: 1, max: 16, step: 0.1 };
    this.inclineRange = { min: 0, max: 0, step: 1 };
    this.confirmed = false; // czy protokół sterowania został potwierdzony
    this._dataCb = () => {};
    this._frameCb = () => {};
    this._logCb = () => {};
  }

  onData(cb) { this._dataCb = cb; }
  onStatus() { /* brak odpowiednika */ }
  onFrame(cb) { this._frameCb = cb; }
  onLog(cb) { this._logCb = cb; }
  log(...a) { this._logCb(a.join(' ')); }

  static async findService(server) {
    for (const uuid of PROPRIETARY) {
      try { return await server.getPrimaryService(uuid); } catch { /* próbuj dalej */ }
    }
    return null;
  }

  async init(server) {
    this.service = await ProprietaryDriver.findService(server);
    if (!this.service) throw new Error('Nie znaleziono żadnej znanej usługi własnościowej.');
    this.log('Wykryto usługę własnościową: ' + this.service.uuid);

    const chars = await this.service.getCharacteristics();
    for (const c of chars) {
      const p = c.properties;
      if ((p.write || p.writeWithoutResponse) && !this.writeChar) this.writeChar = c;
      if (p.notify || p.indicate) this.notifyChars.push(c);
    }

    for (const c of this.notifyChars) {
      c.addEventListener('characteristicvaluechanged', (e) => this._onFrame(c.uuid, e.target.value));
      try {
        await c.startNotifications();
        this.log('Subskrybuję ' + c.uuid);
      } catch (e) { this.log('Nie mogę subskrybować ' + c.uuid + ': ' + e.message); }
    }

    if (!this.writeChar) this.log('UWAGA: brak kanału zapisu - sterowanie niemożliwe.');
    else this.log('Kanał zapisu: ' + this.writeChar.uuid);
    return this;
  }

  _onFrame(uuid, dv) {
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    this._frameCb({ uuid, bytes, hex: hex(dv), ts: Date.now() });
    const parsed = this.tryParseMetrics(bytes);
    if (parsed) this._dataCb(parsed);
  }

  /**
   * Heurystyczna próba wyciągnięcia metryk z nieznanej ramki.
   * Zwraca null, dopóki nie znamy layoutu - dane surowe i tak trafiają do
   * logu diagnostycznego, na którego podstawie uzupełnimy tę funkcję.
   */
  tryParseMetrics(bytes) {
    if (bytes.length < 6 || bytes[0] !== START) return null;
    return null;
  }

  buildFrame(cmd, data = []) {
    const len = data.length + 2; // CMD + DATA + CHECKSUM
    const cs = CHECKSUM_VARIANTS[this.checksumVariant](len, cmd, data);
    return new Uint8Array([START, len, cmd, ...data, cs, END]);
  }

  async sendRaw(bytes) {
    if (!this.writeChar) throw new Error('Brak kanału zapisu.');
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.log('-> ' + hex(buf));
    if (this.writeChar.properties.write && this.writeChar.writeValueWithResponse) {
      await this.writeChar.writeValueWithResponse(buf);
    } else {
      await this.writeChar.writeValue(buf);
    }
  }

  async send(cmd, data = []) { return this.sendRaw(this.buildFrame(cmd, data)); }

  async requestControl() { return this.send(OPCODES.handshake); }
  async start() { return this.send(OPCODES.control, [0x01]); }
  async pause() { return this.send(OPCODES.control, [0x02]); }
  async stop()  { return this.send(OPCODES.control, [0x00]); }

  async setSpeed(kmh) {
    const v = Math.round(this.clampSpeed(kmh) * 10); // typowo 0.1 km/h w jednym bajcie
    return this.send(OPCODES.setTarget, [v & 0xff, 0x00]);
  }

  async setIncline(pct) {
    const v = Math.round(this.clampIncline(pct));
    return this.send(OPCODES.setTarget, [0x00, v & 0xff]);
  }

  clampSpeed(kmh) {
    const { min, max } = this.speedRange;
    return Math.min(max, Math.max(min, Math.round(kmh * 10) / 10));
  }

  clampIncline(pct) {
    const { min, max } = this.inclineRange;
    return Math.min(max, Math.max(min, Math.round(pct)));
  }

  get capabilities() {
    return {
      control: !!this.writeChar && this.confirmed,
      speed: !!this.writeChar && this.confirmed,
      incline: !!this.writeChar && this.confirmed && this.inclineRange.max > 0,
      speedRange: this.speedRange,
      inclineRange: this.inclineRange,
      unverified: !this.confirmed,
    };
  }
}
