// Warstwa połączenia: wybór urządzenia, dobór sterownika, ponowne łączenie
// oraz bezpieczne, stopniowe zmiany prędkości.

import { ALL_OPTIONAL, FTMS } from './uuids.js';
import { FtmsDriver } from './ftms.js';
import { ProprietaryDriver } from './proprietary.js';
import { Diagnostics } from './diagnostics.js';

export const bleAvailable = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;

export class Treadmill {
  constructor() {
    this.device = null;
    this.server = null;
    this.driver = null;
    this.diagnostics = null;
    this.metrics = {};
    this.connected = false;
    this._listeners = { data: [], log: [], state: [], status: [], frame: [] };
    this._ramp = null;
    this.targetSpeed = 0;
    this.targetIncline = 0;
  }

  on(evt, cb) { this._listeners[evt].push(cb); return this; }
  _emit(evt, payload) { for (const cb of this._listeners[evt]) cb(payload); }
  log(msg) { this._emit('log', { ts: Date.now(), msg: String(msg) }); }

  /** Wywołanie MUSI nastąpić w reakcji na gest użytkownika (wymóg przeglądarki). */
  async pick({ acceptAll = true, namePrefix = '' } = {}) {
    if (!bleAvailable()) {
      throw new Error(
        'Ta przeglądarka nie obsługuje Web Bluetooth. Użyj Chrome lub Edge na Androidzie ' +
        'i upewnij się, że strona działa po HTTPS.'
      );
    }
    const opts = { optionalServices: ALL_OPTIONAL };
    if (namePrefix) opts.filters = [{ namePrefix }];
    else if (acceptAll) opts.acceptAllDevices = true;
    else opts.filters = [{ services: [FTMS.service] }];

    this.device = await navigator.bluetooth.requestDevice(opts);
    this.log('Wybrano urządzenie: ' + (this.device.name || '(bez nazwy)') + ' [' + this.device.id + ']');
    this.device.addEventListener('gattserverdisconnected', () => this._onDisconnected());
    return this.device;
  }

  async connect() {
    if (!this.device) throw new Error('Najpierw wybierz bieżnię.');
    this._emit('state', { state: 'connecting' });
    this.server = await this.device.gatt.connect();
    this.log('Połączono z GATT.');

    const isFtms = await FtmsDriver.isSupportedBy(this.server);
    this.driver = isFtms ? new FtmsDriver() : new ProprietaryDriver();
    this.log(isFtms
      ? 'Bieżnia obsługuje standard FTMS - używam pełnego sterowania.'
      : 'Brak FTMS. Szukam protokołu własnościowego (FitShow).');

    this.driver.onLog((m) => this.log(m));
    this.driver.onData((m) => {
      this.metrics = { ...this.metrics, ...m, ts: Date.now() };
      this._emit('data', this.metrics);
    });
    this.driver.onStatus((s) => {
      this.log('Status bieżni: ' + s.text);
      this._emit('status', s);
    });
    this.driver.onFrame?.((f) => this._emit('frame', f));

    await this.driver.init(this.server);
    this.connected = true;
    this._emit('state', { state: 'connected', driver: this.driver.name, caps: this.driver.capabilities });
    return this.driver;
  }

  async runDiagnostics() {
    if (!this.server) throw new Error('Brak połączenia.');
    this.diagnostics = new Diagnostics(this.server, (m) => this.log(m));
    this.diagnostics.onFrame((f) => this._emit('frame', f));
    const info = await this.diagnostics.readDeviceInfo();
    await this.diagnostics.run();
    return { tree: this.diagnostics.tree, info };
  }

  _onDisconnected() {
    this.connected = false;
    this.stopRamp();
    this.log('Rozłączono z bieżnią.');
    this._emit('state', { state: 'disconnected' });
  }

  async disconnect() {
    this.stopRamp();
    try { if (this.device?.gatt?.connected) this.device.gatt.disconnect(); }
    finally { this.connected = false; }
  }

  async reconnect(attempts = 5) {
    for (let i = 1; i <= attempts; i++) {
      try {
        this.log('Próba ponownego połączenia ' + i + '/' + attempts + '...');
        await this.connect();
        return true;
      } catch (e) {
        this.log('Nieudana: ' + e.message);
        await new Promise((r) => setTimeout(r, 1000 * i));
      }
    }
    return false;
  }

  get caps() {
    return this.driver?.capabilities ?? { control: false, speed: false, incline: false };
  }

  // --- Sterowanie -----------------------------------------------------------

  async start() { return this.driver.start(); }
  async pauseBelt() { return this.driver.pause(); }
  async stopBelt() { this.stopRamp(); return this.driver.stop(); }

  async setIncline(pct) {
    if (!this.caps.incline) return;
    this.targetIncline = this.driver.clampIncline(pct);
    return this.driver.setIncline(this.targetIncline);
  }

  /** Natychmiastowa zmiana prędkości - używana przez rampę i awaryjne akcje. */
  async setSpeedNow(kmh) {
    this.targetSpeed = this.driver.clampSpeed(kmh);
    return this.driver.setSpeed(this.targetSpeed);
  }

  /**
   * Prędkość ustawiona z panelu bieżni. Bieżnia nie mówi o niej ani słowa —
   * wiemy o niej tylko stąd, że pas biegnie inaczej, niż mu kazaliśmy.
   * Zapisujemy ją jako obowiązujący cel, żeby kolejna rampa ruszała z miejsca,
   * w którym pas naprawdę jest, a nie z wartości zamówionej kwadrans temu.
   */
  adoptSpeed(kmh) {
    this.targetSpeed = this.driver.clampSpeed(kmh);
    return this.targetSpeed;
  }

  stopRamp() {
    if (this._ramp) { clearInterval(this._ramp); this._ramp = null; }
  }

  /**
   * Dochodzi do prędkości docelowej stopniowo, zamiast skakać np. z 6 na 16 km/h.
   * To nie kosmetyka - nagły skok prędkości pasa jest realnym ryzykiem upadku.
   */
  rampTo(target, { step = 0.5, intervalMs = 700 } = {}) {
    this.stopRamp();
    const goal = this.driver.clampSpeed(target);
    return new Promise((resolve) => {
      const tick = async () => {
        const cur = this.targetSpeed || this.metrics.speed || 0;
        const diff = goal - cur;
        if (Math.abs(diff) <= step + 0.01) {
          this.stopRamp();
          try { await this.setSpeedNow(goal); } catch (e) { this.log('Ramp: ' + e.message); }
          resolve(goal);
          return;
        }
        const next = cur + Math.sign(diff) * step;
        try { await this.setSpeedNow(next); } catch (e) { this.log('Ramp: ' + e.message); }
      };
      tick();
      this._ramp = setInterval(tick, intervalMs);
    });
  }
}
