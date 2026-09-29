'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { generate, OUT } = require('../tools/gen-vectors');
const E = require('../engine');

test('uyumluluk vektörleri güncel (değilse: npm run vectors)', () => {
  const file = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  assert.deepEqual(file, JSON.parse(JSON.stringify(generate())));
});

test('vektörler motoru bağımsız yeniden oynatınca tutar ve yeterince geniştir', () => {
  const file = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  assert.ok(file.cases.length >= 500, `vaka sayısı ${file.cases.length}`);
  const seen = new Set();
  for (const c of file.cases) {
    const neg = E.newNegotiation({ price: c.X }, c.type, c.bonusRep);
    assert.deepEqual({ rep: neg.rep, maxRep: neg.maxRep, price: neg.price, status: neg.status }, c.start);
    for (const s of c.steps) {
      let got;
      try {
        const e = E.haggle(neg, { X: c.X, type: c.type, Y: s.in.Y, approach: s.in.approach, bonus: s.in.bonus, rolls: s.in.rolls, dcMod: s.in.dcMod || 0 });
        got = { outcome: e.outcome, roll: e.roll, total: e.total, repLoss: e.repLoss, price: e.price, rep: neg.rep, status: neg.status, lastY: neg.lastY };
      } catch (err) { got = { error: err.message }; }
      assert.deepEqual(got, s.out);
      seen.add(got.outcome || 'error');
    }
  }
  for (const o of ['crit', 'success', 'fail', 'ret', 'angered', 'error']) assert.ok(seen.has(o), `vektörlerde ${o} sonucu yok`);
});
