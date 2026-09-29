// Generator ikon PWA bez zewnętrznych zależności — koduje PNG ręcznie
// przez wbudowany zlib. Uruchom: node tools/make-icons.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // truecolor + alpha
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Ikona: pomarańczowe tło + trzy ciemne „paski prędkości" i strzałka. */
function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const px = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const sa = a / 255;
    buf[i]     = Math.round(buf[i]     * (1 - sa) + r * sa);
    buf[i + 1] = Math.round(buf[i + 1] * (1 - sa) + g * sa);
    buf[i + 2] = Math.round(buf[i + 2] * (1 - sa) + b * sa);
    buf[i + 3] = 255;
  };

  // Tło: gradient pionowy.
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const r = Math.round(255 * (1 - t) + 255 * t);
    const g = Math.round(106 * (1 - t) + 161 * t);
    const b = Math.round(43 * (1 - t) + 74 * t);
    for (let x = 0; x < size; x++) px(x, y, r, g, b);
  }

  const D = [24, 10, 20]; // kolor ciemny
  const rect = (x0, y0, w, h, rad) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const dx = Math.min(x - x0, x0 + w - 1 - x);
        const dy = Math.min(y - y0, y0 + h - 1 - y);
        if (dx < rad && dy < rad) {
          const d = Math.hypot(rad - dx, rad - dy);
          if (d > rad) continue;
          if (d > rad - 1.2) { px(x, y, ...D, 150); continue; }
        }
        px(x, y, ...D);
      }
    }
  };

  const u = size / 100;
  const barH = Math.round(9 * u);
  const rad = Math.round(barH / 2);
  // Trzy paski o malejącej długości — czyta się jako „prędkość".
  rect(Math.round(18 * u), Math.round(28 * u), Math.round(58 * u), barH, rad);
  rect(Math.round(18 * u), Math.round(45 * u), Math.round(44 * u), barH, rad);
  rect(Math.round(18 * u), Math.round(62 * u), Math.round(30 * u), barH, rad);

  // Grot strzałki po prawej.
  const cx = Math.round(74 * u), cy = Math.round(49.5 * u), s = Math.round(15 * u);
  for (let y = -s; y <= s; y++) {
    const w = Math.round((1 - Math.abs(y) / s) * s * 0.95);
    for (let x = 0; x <= w; x++) px(cx + x, cy + y, ...D);
  }

  return buf;
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
for (const size of [192, 512]) {
  const file = path.join(out, 'icon-' + size + '.png');
  fs.writeFileSync(file, png(size, size, draw(size)));
  console.log('zapisano', file);
}
