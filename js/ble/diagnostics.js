// Pełny zrzut drzewa GATT bieżni. To narzędzie odpowiada na pytanie
// "jakim protokołem właściwie mówi ta bieżnia" - wynik można wyeksportować
// do pliku tekstowego.

import { KNOWN_NAMES, DEVICE_INFO, hex } from './uuids.js';

const nameOf = (uuid) => KNOWN_NAMES[uuid] || '';

const propsOf = (p) =>
  Object.entries({
    read: p.read,
    write: p.write,
    writeNoResp: p.writeWithoutResponse,
    notify: p.notify,
    indicate: p.indicate,
  })
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(', ') || 'brak';

/**
 * Przechodzi wszystkie usługi i charakterystyki, czyta co się da,
 * subskrybuje wszystkie kanały notyfikacji i zbiera przychodzące ramki.
 */
export class Diagnostics {
  constructor(server, log) {
    this.server = server;
    this.log = log;
    this.tree = [];
    this.frames = [];
    this.subscribed = [];
    this.maxFrames = 2000;
  }

  onFrame(cb) { this._frameCb = cb; }

  async run() {
    const services = await this.server.getPrimaryServices();
    this.log('Znaleziono ' + services.length + ' usług GATT.');

    for (const svc of services) {
      const node = { uuid: svc.uuid, name: nameOf(svc.uuid), chars: [] };
      let chars = [];
      try { chars = await svc.getCharacteristics(); }
      catch (e) { node.error = e.message; }

      for (const c of chars) {
        const entry = {
          uuid: c.uuid,
          name: nameOf(c.uuid),
          props: propsOf(c.properties),
          raw: null,
          text: null,
        };

        if (c.properties.read) {
          try {
            const dv = await c.readValue();
            entry.raw = hex(dv);
            entry.text = this._asText(dv);
          } catch (e) { entry.raw = 'BŁĄD ODCZYTU: ' + e.message; }
        }

        if (c.properties.notify || c.properties.indicate) {
          try {
            c.addEventListener('characteristicvaluechanged', (e) => {
              const f = {
                ts: Date.now(),
                service: svc.uuid,
                char: c.uuid,
                hex: hex(e.target.value),
                len: e.target.value.byteLength,
              };
              this.frames.push(f);
              if (this.frames.length > this.maxFrames) this.frames.shift();
              this._frameCb?.(f);
            });
            await c.startNotifications();
            this.subscribed.push(c);
            entry.subscribed = true;
          } catch (e) { entry.subscribeError = e.message; }
        }

        node.chars.push(entry);
      }
      this.tree.push(node);
    }
    return this.tree;
  }

  _asText(dv) {
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    if (!bytes.length) return null;
    const printable = [...bytes].every((b) => b === 0 || (b >= 0x20 && b < 0x7f));
    if (!printable) return null;
    const s = new TextDecoder().decode(bytes).replace(/\0+$/, '');
    return s.trim() ? s : null;
  }

  async readDeviceInfo() {
    const out = {};
    try {
      const svc = await this.server.getPrimaryService(DEVICE_INFO.service);
      for (const [key, uuid] of Object.entries(DEVICE_INFO)) {
        if (key === 'service') continue;
        try {
          const c = await svc.getCharacteristic(uuid);
          out[key] = new TextDecoder().decode(await c.readValue()).replace(/\0+$/, '');
        } catch { /* charakterystyka opcjonalna */ }
      }
    } catch { /* usługa opcjonalna */ }
    return out;
  }

  async stop() {
    for (const c of this.subscribed) {
      try { await c.stopNotifications(); } catch { /* rozłączone */ }
    }
    this.subscribed = [];
  }

  /** Raport tekstowy do wysłania / wklejenia. */
  toReport(meta = {}) {
    const L = [];
    L.push('=== RAPORT DIAGNOSTYCZNY BIEŻNI (ZipRun) ===');
    L.push('Data: ' + new Date().toISOString());
    for (const [k, v] of Object.entries(meta)) L.push(k + ': ' + v);
    L.push('');
    L.push('--- DRZEWO GATT ---');
    for (const s of this.tree) {
      L.push('');
      L.push('USŁUGA ' + s.uuid + (s.name ? '   // ' + s.name : ''));
      if (s.error) L.push('  BŁĄD: ' + s.error);
      for (const c of s.chars) {
        L.push('  CHAR ' + c.uuid + (c.name ? '   // ' + c.name : ''));
        L.push('       właściwości: ' + c.props);
        if (c.raw !== null) L.push('       odczyt: ' + c.raw);
        if (c.text) L.push('       jako tekst: "' + c.text + '"');
        if (c.subscribed) L.push('       subskrypcja: aktywna');
        if (c.subscribeError) L.push('       subskrypcja NIEUDANA: ' + c.subscribeError);
      }
    }
    L.push('');
    L.push('--- RAMKI PRZYCHODZĄCE (' + this.frames.length + ') ---');
    const t0 = this.frames[0]?.ts ?? Date.now();
    for (const f of this.frames) {
      L.push(
        String((f.ts - t0) / 1000).padStart(8) + 's  ' +
        f.char.slice(4, 8) + '  len=' + String(f.len).padStart(2) + '  ' + f.hex
      );
    }
    return L.join('\n');
  }
}
