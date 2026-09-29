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

test('DC and Rep starting values', () => {
  assert.deepEqual([TYPES.generous.dc, TYPES.neutral.dc, TYPES.greedy.dc], [12, 15, 18]);
  assert.deepEqual([TYPES.generous.rep, TYPES.neutral.rep, TYPES.greedy.rep], [4, 3, 2]);
});

test('critical: a natural 20 or DC+5', () => {
  assert.equal(go('neutral', 60, [20]).e.price, 60);
  assert.equal(go('neutral', 60, [10], { bonus: 10 }).e.outcome, 'crit');
});

test('success price Y + a*u/2 (25% / 50% / 75%)', () => {
  const p = (t, r) => go(t, 60, [r]).e.price;
  assert.equal(p('generous', 12), 65);
  assert.equal(p('neutral', 15), 70);
  assert.equal(p('greedy', 18), 75);
});

test('failure price X - a*u/2 and Rep -1 (Persuasion)', () => {
  const { neg, e } = go('neutral', 60, [1]);
  assert.equal(e.outcome, 'fail');
  assert.equal(neg.price, 90);
  assert.equal(neg.rep, 2);
  assert.equal(neg.status, 'open');
  assert.equal(go('generous', 60, [1]).e.price, 95);
  assert.equal(go('greedy', 60, [1]).e.price, 85);
});

test('Rep -2 when Deception and Intimidation fail', () => {
  assert.equal(go('generous', 60, [1], { approach: 'deception' }).neg.rep, 2);
  assert.equal(go('generous', 60, [1], { approach: 'intimidation' }).neg.rep, 2);
});

test('Y < X/4: rejected without a roll, Rep -1', () => {
  const { neg, e } = go('neutral', 24.99, []);
  assert.equal(e.outcome, 'ret');
  assert.equal(e.roll, null);
  assert.equal(neg.rep, 2);
  assert.equal(neg.price, 100);
  assert.equal(go('neutral', 25, [20]).e.outcome, 'crit');
});

test('Y lower than the previous offer: Rep -1, the die is still rolled', () => {
  const a = go('generous', 60, [1]);            // fail, rep 4 -> 3
  const b = go('generous', 50, [20], { neg: a.neg });
  assert.equal(b.e.outcome, 'crit');
  assert.equal(b.neg.rep, 2);                 // 3 - 1 (lower offer)
  const c = go('generous', 60, [1]);
  const d = go('generous', 60, [1], { neg: c.neg }); // the same Y is free, only the failure penalty applies
  assert.equal(d.neg.rep, 2);
});

test('Rep 0: 1.1 X, haggling closes', () => {
  const a = go('greedy', 60, [1]);           // 2 -> 1
  const b = go('greedy', 60, [1], { neg: a.neg });
  assert.equal(b.e.outcome, 'angered');
  assert.equal(b.neg.price, 110);
  assert.equal(b.neg.status, 'angered');
  assert.throws(() => go('greedy', 60, [20], { neg: a.neg }), /over/);
});

test('no die is rolled if the lower-Y penalty alone brings Rep to 0', () => {
  const neg = newNegotiation(item, 'greedy');
  neg.rep = 1; neg.lastY = 70;
  const e = haggle(neg, { X: 100, type: 'greedy', Y: 60, approach: 'persuasion', bonus: 0, rolls: [20] });
  assert.equal(e.outcome, 'angered');
  assert.equal(e.roll, null);
});

test('advantage: the higher of two dice', () => {
  assert.equal(go('neutral', 60, [3, 16]).e.outcome, 'success');
});

test('offer limits', () => {
  assert.throws(() => go('neutral', 100, [10]));
  assert.throws(() => go('neutral', 0, [10]));
});

test('affinity: DC reduction and starting patience bonus', () => {
  const neg = newNegotiation(item, 'neutral', 1);
  assert.equal(neg.rep, 4);
  assert.equal(neg.maxRep, 4);
  // DC 15, dcMod -3 => DC 12: a total of 12 is a success
  const n1 = newNegotiation(item, 'neutral');
  const e1 = haggle(n1, { X: 100, type: 'neutral', Y: 60, approach: 'persuasion', bonus: 2, rolls: [10], dcMod: -3 });
  assert.equal(e1.outcome, 'success');
  // the same die fails without the DC reduction
  const n2 = newNegotiation(item, 'neutral');
  assert.equal(haggle(n2, { X: 100, type: 'neutral', Y: 60, approach: 'persuasion', bonus: 2, rolls: [10] }).outcome, 'fail');
  // the crit threshold shifts too: DC 12 + 5 = 17
  const n3 = newNegotiation(item, 'neutral');
  assert.equal(haggle(n3, { X: 100, type: 'neutral', Y: 60, approach: 'persuasion', bonus: 2, rolls: [15], dcMod: -3 }).outcome, 'crit');
});

test('the mood does not leak numbers', () => {
  const neg = newNegotiation(item, 'neutral');
  assert.equal(moodOf(neg, 'neutral'), '😊');
  neg.rep = 2; assert.equal(moodOf(neg, 'neutral'), '😐');
  neg.rep = 1; assert.equal(moodOf(neg, 'neutral'), '😠');
  neg.rep = 0; assert.equal(moodOf(neg, 'neutral'), '😡');
});
