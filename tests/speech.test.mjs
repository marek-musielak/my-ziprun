// Zapowiedzi głosowe: czekanie na koniec wypowiedzi na podrobionej syntezie mowy.
// Prawdziwego głosu w Node nie ma, więc sprawdzamy, jak Speech obchodzi się ze zdarzeniami.

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Speech } from '../js/speech.js';

let synteza;

beforeEach(() => {
  synteza = {
    wypowiedzi: [],
    anulowania: 0,
    getVoices: () => [],
    addEventListener() {},
    speak(u) { this.wypowiedzi.push(u); },
    cancel() { this.anulowania++; },
  };
  globalThis.speechSynthesis = synteza;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  mock.timers.enable({ apis: ['setTimeout'] });
});

afterEach(() => {
  mock.timers.reset();
  delete globalThis.speechSynthesis;
  delete globalThis.SpeechSynthesisUtterance;
});

const ostatnia = () => synteza.wypowiedzi.at(-1);
const czeka = async (obietnica) => {
  let skonczone = false;
  obietnica.then(() => { skonczone = true; });
  await Promise.resolve();
  await Promise.resolve();
  return !skonczone;
};

describe('Speech.sayAndWait', () => {
  test('czeka, aż wypowiedź się skończy', async () => {
    const glos = new Speech();
    const p = glos.sayAndWait('Start za 5 sekund');
    assert.equal(ostatnia().text, 'Start za 5 sekund');
    assert.equal(await czeka(p), true, 'jeszcze trwa');

    ostatnia().onend();
    await p;
  });

  test('błąd syntezy też kończy czekanie', async () => {
    const glos = new Speech();
    const p = glos.sayAndWait('x');
    ostatnia().onerror();
    await p;
  });

  test('bez zdarzenia kończy po limicie czasu', async () => {
    const glos = new Speech();
    const p = glos.sayAndWait('x', { maxMs: 6000 });
    mock.timers.tick(5999);
    assert.equal(await czeka(p), true, 'limit jeszcze nie minął');

    mock.timers.tick(1);
    await p;
  });

  test('wyłączony głos kończy od razu i nic nie mówi', async () => {
    const glos = new Speech();
    glos.enabled = false;
    await glos.sayAndWait('x');
    assert.equal(synteza.wypowiedzi.length, 0);
  });

  test('pusty tekst kończy od razu', async () => {
    await new Speech().sayAndWait('');
    assert.equal(synteza.wypowiedzi.length, 0);
  });

  test('brak syntezy mowy w przeglądarce kończy od razu', async () => {
    delete globalThis.speechSynthesis;
    await new Speech().sayAndWait('x');
  });

  test('przed mówieniem ucina to, co jeszcze brzmi', async () => {
    const glos = new Speech();
    const p = glos.sayAndWait('x');
    assert.equal(synteza.anulowania, 1);
    ostatnia().onend();
    await p;
  });
});

describe('Speech.say', () => {
  test('z priorytetem ucina poprzednią wypowiedź, bez niego dokłada do kolejki', () => {
    const glos = new Speech();
    glos.say('a');
    assert.equal(synteza.anulowania, 0);
    glos.say('b', { priority: true });
    assert.equal(synteza.anulowania, 1);
    assert.deepEqual(synteza.wypowiedzi.map((u) => u.text), ['a', 'b']);
  });
});
