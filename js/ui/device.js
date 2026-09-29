// Zakładka Bieżnia: połączenie, możliwości urządzenia, diagnostyka GATT,
// test sterowania i ręczne ramki.

import { STATE } from '../engine.js';
import { parseHex, KNOWN_NAMES } from '../ble/uuids.js';
import { VERSION } from '../version.js';
import * as store from '../storage.js';
import { $, els, tm, engine, stan, toast, downloadText, stamp } from './core.js';
import { goto } from './nav.js';
import { renderPlans, odswiezOstrzezenia } from './plan-list.js';
import { updateInclineUi } from './run.js';

function logLine(msg) {
  const box = $('log');
  const t = new Date().toLocaleTimeString('pl-PL');
  box.textContent += '[' + t + '] ' + msg + '\n';
  box.scrollTop = box.scrollHeight;
}

tm.on('log', (e) => logLine(e.msg));

tm.on('state', (e) => {
  const dot = $('conn-dot');
  dot.className = 'dot' + (e.state === 'connected' ? ' on' : e.state === 'connecting' ? ' wait' : '');
  if (e.state === 'connected') {
    $('btn-connect').textContent = tm.device?.name || 'Połączona';
    $('dev-status').innerHTML = 'Połączono z <b>' + (tm.device?.name || 'urządzeniem') + '</b><br>' +
      'Protokół: <b>' + e.driver + '</b>';
    renderCaps(e.caps);
    stan.settings.lastDeviceName = tm.device?.name || '';
    store.saveSettings(stan.settings);
    toast('Połączono: ' + (tm.device?.name || 'bieżnia'));
  } else if (e.state === 'disconnected') {
    $('btn-connect').textContent = 'Połącz bieżnię';
    $('dev-status').textContent = 'Rozłączono.';
    if (engine.state === STATE.RUNNING) {
      engine.pause('Utracono połączenie z bieżnią.');
      tm.reconnect().then((ok) => { if (ok) toast('Połączenie odzyskane — wznów trening.'); });
    }
  }
  // Ostrzeżenia na ekranie planu mówią o bieżni, więc muszą nadążać za nią,
  // a nie za chwilą, w której plan został otwarty.
  odswiezOstrzezenia();
});

function renderCaps(caps) {
  const profile = stan.profile;
  const yn = (v) => (v ? '<b>tak</b>' : 'nie');
  $('dev-caps').innerHTML =
    'Sterowanie prędkością: ' + yn(caps.speed) + '<br>' +
    'Sterowanie nachyleniem: ' + yn(caps.incline) + '<br>' +
    'Zakres prędkości: <b>' + caps.speedRange.min + '–' + caps.speedRange.max + ' km/h</b><br>' +
    'Zakres nachylenia: <b>' + caps.inclineRange.min + '–' + caps.inclineRange.max + ' %</b>' +
    (caps.unverified
      ? '<br><span style="color:var(--warn)">Protokół własnościowy — komendy sterujące nie są jeszcze potwierdzone. ' +
        'Uruchom diagnostykę i test sterowania.</span>'
      : '');
  // Limit z profilu nie powinien przekraczać tego, co bieżnia w ogóle potrafi.
  if (caps.speedRange.max && profile.maxSpeedCap > caps.speedRange.max) {
    profile.maxSpeedCap = caps.speedRange.max;
    store.saveProfile(profile);
  }
  if (caps.inclineRange.max != null && profile.maxInclineCap > caps.inclineRange.max) {
    profile.maxInclineCap = caps.inclineRange.max;
    store.saveProfile(profile);
  }
  updateInclineUi();
  renderPlans();
}

async function connectFlow() {
  try {
    await tm.pick();
    await tm.connect();
  } catch (e) {
    if (e.name === 'NotFoundError') toast('Nie wybrano urządzenia.');
    else toast('Błąd połączenia: ' + e.message, true);
    logLine('BŁĄD: ' + e.message);
  }
}

$('btn-connect').addEventListener('click', () => {
  if (tm.connected) goto('device'); else connectFlow();
});
$('btn-pick').addEventListener('click', connectFlow);
$('btn-disconnect').addEventListener('click', () => tm.disconnect());

$('btn-diag').addEventListener('click', async () => {
  if (!tm.connected) return toast('Najpierw połącz bieżnię.', true);
  $('btn-diag').textContent = 'Skanuję...';
  try {
    const { tree, info } = await tm.runDiagnostics();
    const infoLines = Object.entries(info).map(([k, v]) => k + ': ' + v).join('\n');
    $('diag-tree').textContent =
      (infoLines ? infoLines + '\n\n' : '') +
      tree.map((s) =>
        'USŁUGA ' + s.uuid + (KNOWN_NAMES[s.uuid] ? '  // ' + KNOWN_NAMES[s.uuid] : '') + '\n' +
        s.chars.map((c) =>
          '  ' + c.uuid.slice(4, 8) + ' [' + c.props + ']' +
          (c.name ? '  // ' + c.name : '') +
          (c.raw ? '\n     = ' + c.raw : '') +
          (c.text ? '\n     "' + c.text + '"' : '')
        ).join('\n')
      ).join('\n\n');
    toast('Diagnostyka gotowa. Pozmieniaj teraz prędkość na konsoli bieżni.');
  } catch (e) {
    toast('Diagnostyka nieudana: ' + e.message, true);
  } finally {
    $('btn-diag').textContent = 'Uruchom diagnostykę';
  }
});

tm.on('frame', (f) => logLine('<- ' + (f.char || f.uuid || '').slice(4, 8) + '  ' + f.hex));

$('btn-export').addEventListener('click', () => {
  if (!tm.diagnostics) return toast('Najpierw uruchom diagnostykę.', true);
  const report = tm.diagnostics.toReport({
    'Wersja aplikacji': 'ZipRun ' + VERSION,
    'Urządzenie': tm.device?.name || '(bez nazwy)',
    'Sterownik': tm.driver?.name || '-',
    'Możliwości': JSON.stringify(tm.caps),
  });
  downloadText('ziprun-diagnostyka-' + stamp() + '.txt', report);
});

els('[data-test]').forEach((b) =>
  b.addEventListener('click', async () => {
    if (!tm.connected) return toast('Najpierw połącz bieżnię.', true);
    const map = {
      control: () => tm.driver.requestControl(),
      start: () => tm.start(),
      s3: () => tm.setSpeedNow(3),
      s6: () => tm.setSpeedNow(6),
      i2: () => tm.setIncline(2),
      stop: () => tm.stopBelt(),
    };
    try {
      await map[b.dataset.test]();
      logLine('Test "' + b.dataset.test + '": OK');
      toast('Komenda przyjęta.');
      if (tm.driver && 'confirmed' in tm.driver) {
        tm.driver.confirmed = true;
        renderCaps(tm.caps);
      }
    } catch (e) {
      logLine('Test "' + b.dataset.test + '": ' + e.message);
      toast('Odrzucone: ' + e.message, true);
    }
  })
);

$('btn-raw').addEventListener('click', async () => {
  const bytes = parseHex($('raw-hex').value);
  if (!bytes.length) return toast('Podaj bajty w hex.', true);
  try {
    if (tm.driver?.sendRaw) await tm.driver.sendRaw(bytes);
    else throw new Error('Ten sterownik nie obsługuje wysyłki surowych ramek.');
  } catch (e) { toast(e.message, true); }
});

$('btn-clear-log').addEventListener('click', () => { $('log').textContent = ''; });
