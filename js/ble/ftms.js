// Sterownik standardu Bluetooth SIG "Fitness Machine Service" (FTMS, 0x1826).
// Zgodny ze specyfikacja FTMS 1.0 - parsowanie Treadmill Data (0x2ACD)
// i sterowanie przez Control Point (0x2AD9).

import { FTMS, hex } from './uuids.js';

const OP = {
  REQUEST_CONTROL: 0x00,
  RESET: 0x01,
  SET_SPEED: 0x02,
  SET_INCLINE: 0x03,
  SET_RESISTANCE: 0x04,
  SET_POWER: 0x05,
  START_RESUME: 0x07,
  STOP_PAUSE: 0x08,
  RESPONSE: 0x80,
};

const RESULT_TEXT = {
  0x01: 'OK',
  0x02: 'nieobsługiwane przez bieżnię',
  0x03: 'nieprawidłowy parametr',
  0x04: 'operacja nieudana',
  0x05: 'brak uprawnień do sterowania (wymagane Request Control)',
};

const STATUS_TEXT = {
  0x01: 'reset',
  0x02: 'zatrzymana lub wstrzymana przez użytkownika',
  0x03: 'zatrzymana kluczykiem bezpieczeństwa',
  0x04: 'start / wznowienie',
  0x05: 'zmieniono docelową prędkość',
  0x06: 'zmieniono docelowe nachylenie',
  0x12: 'zmieniono docelowy czas',
  0x14: 'ukończono trening',
};

/** Parsuje charakterystykę Treadmill Data (0x2ACD) zgodnie z FTMS 1.0. */
export function parseTreadmillData(dv) {
  const flags = dv.getUint16(0, true);
  let o = 2;
  const m = { raw: hex(dv), flags };
  const has = (bit) => (flags & (1 << bit)) !== 0;

  // Bit 0 to "More Data" - logika ODWROTNA: gdy 0, predkosc chwilowa JEST obecna.
  if (!has(0)) { m.speed = dv.getUint16(o, true) / 100; o += 2; }
  if (has(1)) { m.avgSpeed = dv.getUint16(o, true) / 100; o += 2; }
  if (has(2)) {
    m.distance = dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getUint8(o + 2) << 16);
    o += 3; // uint24, metry
  }
  if (has(3)) {
    m.incline = dv.getInt16(o, true) / 10;       // procent
    m.rampAngle = dv.getInt16(o + 2, true) / 10; // stopnie
    o += 4;
  }
  if (has(4)) {
    m.elevationGain = dv.getUint16(o, true) / 10;
    m.elevationLoss = dv.getUint16(o + 2, true) / 10;
    o += 4;
  }
  if (has(5)) { m.pace = dv.getUint8(o) / 10; o += 1; }
  if (has(6)) { m.avgPace = dv.getUint8(o) / 10; o += 1; }
  if (has(7)) {
    m.kcal = dv.getUint16(o, true);
    m.kcalPerHour = dv.getUint16(o + 2, true);
    m.kcalPerMin = dv.getUint8(o + 4);
    o += 5;
    if (m.kcal === 0xffff) delete m.kcal; // 0xFFFF = "niedostepne"
  }
  if (has(8)) { m.hr = dv.getUint8(o); o += 1; }
  if (has(9)) { m.met = dv.getUint8(o) / 10; o += 1; }
  if (has(10)) { m.elapsed = dv.getUint16(o, true); o += 2; }
  if (has(11)) { m.remaining = dv.getUint16(o, true); o += 2; }
  if (has(12)) {
    m.beltForce = dv.getInt16(o, true);
    m.power = dv.getInt16(o + 2, true);
    o += 4;
  }
  return m;
}

/** Rozklada bitmape Fitness Machine Feature (0x2ACC) na czytelne flagi. */
export function parseFeature(dv) {
  const f = dv.getUint32(0, true);
  const t = dv.getUint32(4, true);
  const bit = (v, n) => (v & (1 << n)) !== 0;
  return {
    raw: hex(dv),
    avgSpeed: bit(f, 0),
    cadence: bit(f, 1),
    totalDistance: bit(f, 2),
    inclineSupported: bit(f, 3),
    elevationGain: bit(f, 4),
    paceSupported: bit(f, 5),
    expendedEnergy: bit(f, 9),
    heartRate: bit(f, 10),
    metabolicEquivalent: bit(f, 11),
    elapsedTime: bit(f, 12),
    remainingTime: bit(f, 13),
    powerMeasurement: bit(f, 14),
    // Bitmapa "Target Setting Features" - to ona decyduje, czy da sie STEROWAC.
    canSetSpeed: bit(t, 0),
    canSetIncline: bit(t, 1),
    canSetResistance: bit(t, 2),
    canSetPower: bit(t, 3),
    canSetTargetTime: bit(t, 7),
  };
}

export class FtmsDriver {
  name = 'FTMS';

  constructor() {
    this.chars = {};
    this.feature = null;
    this.speedRange = { min: 1, max: 16, step: 0.1 };
    this.inclineRange = { min: 0, max: 0, step: 1 };
    this.hasControlPoint = false;
    this.hasControl = false;
    this._pending = null;
    this._dataCb = () => {};
    this._statusCb = () => {};
    this._logCb = () => {};
  }

  onData(cb) { this._dataCb = cb; }
  onStatus(cb) { this._statusCb = cb; }
  onLog(cb) { this._logCb = cb; }
  log(...a) { this._logCb(a.join(' ')); }

  static async isSupportedBy(server) {
    try { await server.getPrimaryService(FTMS.service); return true; }
    catch { return false; }
  }

  async init(server) {
    const svc = await server.getPrimaryService(FTMS.service);
    const list = await svc.getCharacteristics();
    for (const c of list) this.chars[c.uuid] = c;
    this.log('FTMS: znaleziono ' + list.length + ' charakterystyk.');

    const feat = this.chars[FTMS.feature];
    if (feat) {
      try {
        this.feature = parseFeature(await feat.readValue());
        this.log('FTMS Feature: ' + JSON.stringify(this.feature));
      } catch (e) { this.log('Nie udalo sie odczytac Feature: ' + e.message); }
    }

    const sr = this.chars[FTMS.speedRange];
    if (sr) {
      try {
        const dv = await sr.readValue();
        this.speedRange = {
          min: dv.getUint16(0, true) / 100,
          max: dv.getUint16(2, true) / 100,
          step: Math.max(0.1, dv.getUint16(4, true) / 100),
        };
        this.log('Zakres predkosci: ' + JSON.stringify(this.speedRange));
      } catch (e) { this.log('Brak odczytu zakresu predkosci: ' + e.message); }
    }

    const ir = this.chars[FTMS.inclineRange];
    if (ir) {
      try {
        const dv = await ir.readValue();
        this.inclineRange = {
          min: dv.getInt16(0, true) / 10,
          max: dv.getInt16(2, true) / 10,
          step: Math.max(0.1, dv.getUint16(4, true) / 10),
        };
        this.log('Zakres nachylenia: ' + JSON.stringify(this.inclineRange));
      } catch (e) { this.log('Brak odczytu zakresu nachylenia: ' + e.message); }
    }

    const data = this.chars[FTMS.treadmillData];
    if (data) {
      data.addEventListener('characteristicvaluechanged', (e) => {
        try { this._dataCb(parseTreadmillData(e.target.value)); }
        catch (err) { this.log('Blad parsowania Treadmill Data: ' + err.message); }
      });
      await data.startNotifications();
      this.log('Subskrybuje Treadmill Data.');
    }

    const st = this.chars[FTMS.machineStatus];
    if (st) {
      st.addEventListener('characteristicvaluechanged', (e) => {
        const dv = e.target.value;
        const op = dv.getUint8(0);
        this._statusCb({
          opcode: op,
          text: STATUS_TEXT[op] || 'nieznany (0x' + op.toString(16) + ')',
          raw: hex(dv),
        });
      });
      try { await st.startNotifications(); } catch { /* opcjonalne */ }
    }

    const cp = this.chars[FTMS.controlPoint];
    if (cp) {
      this.hasControlPoint = true;
      cp.addEventListener('characteristicvaluechanged', (e) => this._onControlResponse(e.target.value));
      try { await cp.startNotifications(); } catch (e) { this.log('Control Point bez indykacji: ' + e.message); }
    } else {
      this.log('UWAGA: bieznia nie udostepnia Control Point - sterowanie przez FTMS niemozliwe.');
    }
    return this;
  }

  _onControlResponse(dv) {
    if (dv.getUint8(0) !== OP.RESPONSE) return;
    const req = dv.getUint8(1);
    const res = dv.getUint8(2);
    if (this._pending && this._pending.opcode === req) {
      const p = this._pending;
      this._pending = null;
      clearTimeout(p.timer);
      if (res === 0x01) p.resolve(res);
      else p.reject(new Error(RESULT_TEXT[res] || 'kod bledu 0x' + res.toString(16)));
    }
  }

  async _cmd(opcode, params = []) {
    const cp = this.chars[FTMS.controlPoint];
    if (!cp) throw new Error('Brak Control Point - ta bieznia nie przyjmuje komend FTMS.');
    const payload = new Uint8Array([opcode, ...params]);
    // Kolejkujemy: FTMS dopuszcza tylko jedna operacje Control Point naraz.
    let waited = 0;
    while (this._pending && waited < 6000) {
      await new Promise((r) => setTimeout(r, 30));
      waited += 30;
    }
    const p = new Promise((resolve, reject) => {
      this._pending = { opcode, resolve, reject };
      this._pending.timer = setTimeout(() => {
        this._pending = null;
        reject(new Error('brak odpowiedzi z biezni (timeout 4 s)'));
      }, 4000);
    });
    this.log('-> Control Point: ' + hex(payload));
    try {
      if (cp.writeValueWithResponse) await cp.writeValueWithResponse(payload);
      else await cp.writeValue(payload);
    } catch (e) {
      if (this._pending) clearTimeout(this._pending.timer);
      this._pending = null;
      throw e;
    }
    return p;
  }

  async requestControl() {
    await this._cmd(OP.REQUEST_CONTROL);
    this.hasControl = true;
    this.log('Uzyskano kontrole nad bieznią.');
  }

  async ensureControl() { if (!this.hasControl) await this.requestControl(); }

  async start() { await this.ensureControl(); return this._cmd(OP.START_RESUME); }
  async pause() { await this.ensureControl(); return this._cmd(OP.STOP_PAUSE, [0x02]); }
  async stop()  { await this.ensureControl(); return this._cmd(OP.STOP_PAUSE, [0x01]); }
  async reset() { return this._cmd(OP.RESET); }

  async setSpeed(kmh) {
    await this.ensureControl();
    const v = Math.round(this.clampSpeed(kmh) * 100);
    return this._cmd(OP.SET_SPEED, [v & 0xff, (v >> 8) & 0xff]);
  }

  async setIncline(pct) {
    await this.ensureControl();
    const v = Math.round(this.clampIncline(pct) * 10);
    return this._cmd(OP.SET_INCLINE, [v & 0xff, (v >> 8) & 0xff]);
  }

  clampSpeed(kmh) {
    const { min, max } = this.speedRange;
    return Math.min(max, Math.max(min, Math.round(kmh * 10) / 10));
  }

  clampIncline(pct) {
    const { min, max } = this.inclineRange;
    return Math.min(max, Math.max(min, Math.round(pct * 10) / 10));
  }

  get capabilities() {
    return {
      control: this.hasControlPoint,
      speed: this.hasControlPoint && (this.feature ? this.feature.canSetSpeed : true),
      incline: this.hasControlPoint && this.inclineRange.max > 0 &&
               (this.feature ? this.feature.canSetIncline : true),
      speedRange: this.speedRange,
      inclineRange: this.inclineRange,
    };
  }
}
