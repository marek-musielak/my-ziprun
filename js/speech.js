// Zapowiedzi głosowe (Web Speech API). Na bieżni nie patrzysz w ekran,
// więc głos jest podstawowym kanałem informacji.

export class Speech {
  constructor() {
    this.enabled = true;
    this.voice = null;
    this.rate = 1.05;
    this.available = typeof speechSynthesis !== 'undefined';
    if (this.available) this._pickVoice();
  }

  _pickVoice() {
    const choose = () => {
      const voices = speechSynthesis.getVoices();
      this.voice = voices.find((v) => v.lang === 'pl-PL')
                || voices.find((v) => v.lang.startsWith('pl'))
                || null;
    };
    choose();
    speechSynthesis.addEventListener('voiceschanged', choose);
  }

  say(text, { priority = false } = {}) {
    if (!this.enabled || !this.available || !text) return;
    if (priority) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pl-PL';
    u.rate = this.rate;
    if (this.voice) u.voice = this.voice;
    speechSynthesis.speak(u);
  }

  beep(freq = 880, ms = 120) {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.frequency.value = freq;
      o.type = 'sine';
      g.gain.setValueAtTime(0.25, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + ms / 1000);
      o.connect(g).connect(this.ctx.destination);
      o.start();
      o.stop(this.ctx.currentTime + ms / 1000);
    } catch { /* audio zablokowane do pierwszego gestu */ }
  }

  cancel() { if (this.available) speechSynthesis.cancel(); }
}

/** Blokada wygaszania ekranu — inaczej telefon gaśnie w środku interwału. */
export class ScreenKeeper {
  constructor() { this.lock = null; }

  async acquire() {
    if (!('wakeLock' in navigator)) return false;
    try {
      this.lock = await navigator.wakeLock.request('screen');
      this.lock.addEventListener('release', () => { this.lock = null; });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && !this.lock) this.acquire();
      });
      return true;
    } catch { return false; }
  }

  release() { try { this.lock?.release(); } catch { /* już zwolniona */ } this.lock = null; }
}
