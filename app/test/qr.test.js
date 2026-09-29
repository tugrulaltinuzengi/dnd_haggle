'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const QR = require('../public/qr.js');
let jsQR = null;
try { jsQR = require('jsqr'); } catch { /* geliştirme bağımlılığı yoksa okuma testleri atlanır */ }

// Modül matrisini gri tonlu RGBA piksele çevirir (sessiz bölge 4 modül) ve gerçek bir QR okuyucuyla çözer.
function decode(matrix, scale = 6) {
  const n = matrix.length, margin = 4, w = (n + margin * 2) * scale, data = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (matrix[y][x]) {
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const o = (((y + margin) * scale + dy) * w + (x + margin) * scale + dx) * 4; data[o] = data[o + 1] = data[o + 2] = 0; }
  }
  const r = jsQR(data, w, w);
  return r && r.data;
}

const cases = [
  'https://pazar.tail1234.ts.net',
  'http://esp32.tail1234.ts.net:3000',
  'https://pazar-gizli-ad-yerel-ag-adresi.tail-abcdef123.ts.net/?davet=abcdef0123456789abcdef0123456789',
  'Türkçe karakterler: çğıöşü ÇĞİÖŞÜ ✓',
  'A',
  'x'.repeat(120),
];

test('QR: gerçek okuyucu tüm örnekleri ve iki düzeltme düzeyini çözer', { skip: !jsQR }, () => {
  for (const text of cases) for (const ecl of ['L', 'M']) {
    assert.equal(decode(QR.matrix(text, { ecl })), text, `${ecl}: ${text.slice(0, 40)}`);
  }
});

test('QR: 8 maskenin hepsi geçerli ve çözülebilir', { skip: !jsQR }, () => {
  for (let mask = 0; mask < 8; mask++) {
    assert.equal(decode(QR.matrix('https://pazar.tail1234.ts.net', { mask })), 'https://pazar.tail1234.ts.net', `maske ${mask}`);
  }
});

test('QR: sürüm sınırında (v7-v10, sürüm bilgisi bitleri) çözülür', { skip: !jsQR }, () => {
  for (const len of [90, 130, 160, 190]) {
    const t = 'https://pazar.example.ts.net/' + 'a'.repeat(len);
    const m = QR.matrix(t, { ecl: 'L' });
    assert.equal(decode(m), t, `uzunluk ${len}, boyut ${m.length}`);
  }
  assert.ok(QR.matrix('x'.repeat(190), { ecl: 'L' }).length >= 45); // sürüm >= 7
});

test('QR: çok uzun metin net hata verir, svg geçerli işaretleme üretir', () => {
  assert.throws(() => QR.matrix('x'.repeat(400)), /çok uzun/);
  const svg = QR.svg('https://pazar.tail1234.ts.net');
  assert.match(svg, /^<svg [^>]*viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /<path d="M\d+,\d+h1v1h-1z/);
  assert.ok(!svg.includes('<script'));
});
