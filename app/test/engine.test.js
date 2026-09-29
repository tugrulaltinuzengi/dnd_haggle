'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { haggle, newNegotiation, moodOf, TYPES } = require('../engine');

const item = { price: 100 };
const go = (type, Y, rolls, extra = {}) => {
  const neg = extra.neg || newNegotiation(item, type);
  const e = haggle(neg, { X: 100, type, Y, approach: extra.approach || 'persuasion', bonus: extra.bonus || 0, rolls });
  return { neg, e };
};

test('DC ve Rep başlangıç değerleri', () => {
  assert.deepEqual([TYPES.comert.dc, TYPES.notr.dc, TYPES.acgozlu.dc], [12, 15, 18]);
  assert.deepEqual([TYPES.comert.rep, TYPES.notr.rep, TYPES.acgozlu.rep], [4, 3, 2]);
});

test('kritik: doğal 20 ya da DC+5', () => {
  assert.equal(go('notr', 60, [20]).e.price, 60);
  assert.equal(go('notr', 60, [10], { bonus: 10 }).e.outcome, 'crit');
});

test('başarı fiyatı Y + a*u/2 (25% / 50% / 75%)', () => {
  const p = (t, r) => go(t, 60, [r]).e.price;
  assert.equal(p('comert', 12), 65);
  assert.equal(p('notr', 15), 70);
  assert.equal(p('acgozlu', 18), 75);
});

test('başarısızlık fiyatı X - a*u/2 ve Rep -1 (İkna)', () => {
  const { neg, e } = go('notr', 60, [1]);
  assert.equal(e.outcome, 'fail');
  assert.equal(neg.price, 90);
  assert.equal(neg.rep, 2);
  assert.equal(neg.status, 'open');
  assert.equal(go('comert', 60, [1]).e.price, 95);
  assert.equal(go('acgozlu', 60, [1]).e.price, 85);
});

test('Blöf ve Gözdağı başarısızlığında Rep -2', () => {
  assert.equal(go('comert', 60, [1], { approach: 'deception' }).neg.rep, 2);
  assert.equal(go('comert', 60, [1], { approach: 'intimidation' }).neg.rep, 2);
});

test('Y < X/4: zarsız ret, Rep -1', () => {
  const { neg, e } = go('notr', 24.99, []);
  assert.equal(e.outcome, 'ret');
  assert.equal(e.roll, null);
  assert.equal(neg.rep, 2);
  assert.equal(neg.price, 100);
  assert.equal(go('notr', 25, [20]).e.outcome, 'crit');
});

test('önceki tekliften düşük Y: Rep -1, zar yine atılır', () => {
  const a = go('comert', 60, [1]);            // fail, rep 4 -> 3
  const b = go('comert', 50, [20], { neg: a.neg });
  assert.equal(b.e.outcome, 'crit');
  assert.equal(b.neg.rep, 2);                 // 3 - 1 (düşük teklif)
  const c = go('comert', 60, [1]);
  const d = go('comert', 60, [1], { neg: c.neg }); // aynı Y serbest, sadece başarısızlık cezası
  assert.equal(d.neg.rep, 2);
});

test('Rep 0: 1.1 X, pazarlık kapanır', () => {
  const a = go('acgozlu', 60, [1]);           // 2 -> 1
  const b = go('acgozlu', 60, [1], { neg: a.neg });
  assert.equal(b.e.outcome, 'angered');
  assert.equal(b.neg.price, 110);
  assert.equal(b.neg.status, 'angered');
  assert.throws(() => go('acgozlu', 60, [20], { neg: a.neg }), /bitti/);
});

test('düşük Y cezası tek başına Rep 0 yaparsa zar atılmaz', () => {
  const neg = newNegotiation(item, 'acgozlu');
  neg.rep = 1; neg.lastY = 70;
  const e = haggle(neg, { X: 100, type: 'acgozlu', Y: 60, approach: 'persuasion', bonus: 0, rolls: [20] });
  assert.equal(e.outcome, 'angered');
  assert.equal(e.roll, null);
});

test('avantaj: iki zarın yükseği', () => {
  assert.equal(go('notr', 60, [3, 16]).e.outcome, 'success');
});

test('teklif sınırları', () => {
  assert.throws(() => go('notr', 100, [10]));
  assert.throws(() => go('notr', 0, [10]));
});

test('yakınlık: DC indirimi ve başlangıç sabır bonusu', () => {
  const neg = newNegotiation(item, 'notr', 1);
  assert.equal(neg.rep, 4);
  assert.equal(neg.maxRep, 4);
  // DC 15, dcMod -3 => DC 12: toplam 12 başarı olur
  const n1 = newNegotiation(item, 'notr');
  const e1 = haggle(n1, { X: 100, type: 'notr', Y: 60, approach: 'persuasion', bonus: 2, rolls: [10], dcMod: -3 });
  assert.equal(e1.outcome, 'success');
  // aynı zar DC indirimi olmadan başarısız
  const n2 = newNegotiation(item, 'notr');
  assert.equal(haggle(n2, { X: 100, type: 'notr', Y: 60, approach: 'persuasion', bonus: 2, rolls: [10] }).outcome, 'fail');
  // kritik eşiği de kayar: DC 12 + 5 = 17
  const n3 = newNegotiation(item, 'notr');
  assert.equal(haggle(n3, { X: 100, type: 'notr', Y: 60, approach: 'persuasion', bonus: 2, rolls: [15], dcMod: -3 }).outcome, 'crit');
});

test('ruh hali sayı sızdırmaz', () => {
  const neg = newNegotiation(item, 'notr');
  assert.equal(moodOf(neg, 'notr'), '😊');
  neg.rep = 2; assert.equal(moodOf(neg, 'notr'), '😐');
  neg.rep = 1; assert.equal(moodOf(neg, 'notr'), '😠');
  neg.rep = 0; assert.equal(moodOf(neg, 'notr'), '😡');
});
