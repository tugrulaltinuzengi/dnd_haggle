'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const QR = require('../public/qr.js');
let jsQR = null;
try { jsQR = require('jsqr'); } catch { /* geliştirme bağımlılığı yoksa okuma testleri atlanır */ }

// Turns the module matrix into grayscale RGBA pixels (4-module quiet zone) and decodes it with a real QR reader.
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
  'Non-ASCII characters: çğıöşü ÇĞİÖŞÜ ✓',
  'A',
  'x'.repeat(120),
];

test('QR: a real reader decodes every sample and both correction levels', { skip: !jsQR }, () => {
  for (const text of cases) for (const ecl of ['L', 'M']) {
    assert.equal(decode(QR.matrix(text, { ecl })), text, `${ecl}: ${text.slice(0, 40)}`);
  }
});

test('QR: all 8 masks are valid and decodable', { skip: !jsQR }, () => {
  for (let mask = 0; mask < 8; mask++) {
    assert.equal(decode(QR.matrix('https://pazar.tail1234.ts.net', { mask })), 'https://pazar.tail1234.ts.net', `maske ${mask}`);
  }
});

test('QR: decodes at the version boundary (v7-v10, version info bits)', { skip: !jsQR }, () => {
  for (const len of [90, 130, 160, 190]) {
    const t = 'https://pazar.example.ts.net/' + 'a'.repeat(len);
    const m = QR.matrix(t, { ecl: 'L' });
    assert.equal(decode(m), t, `uzunluk ${len}, boyut ${m.length}`);
  }
  assert.ok(QR.matrix('x'.repeat(190), { ecl: 'L' }).length >= 45); // version >= 7
});

test('QR: overlong text gives a clear error, the svg is valid markup', () => {
  assert.throws(() => QR.matrix('x'.repeat(400)), /too long/);
  const svg = QR.svg('https://pazar.tail1234.ts.net');
  assert.match(svg, /^<svg [^>]*viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /<path d="M\d+,\d+h1v1h-1z/);
  assert.ok(!svg.includes('<script'));
});
