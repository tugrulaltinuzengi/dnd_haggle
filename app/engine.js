'use strict';
// Haggling rules (PROJE.md, section 3). Pure functions, no dependencies.

const TYPES = {
  generous: { u: 0.5, dc: 12, rep: 4, name: 'Generous' },
  neutral: { u: 1.0, dc: 15, rep: 3, name: 'Neutral' },
  greedy: { u: 1.5, dc: 18, rep: 2, name: 'Greedy' },
};
const APPROACHES = ['persuasion', 'deception', 'intimidation'];
const MIN_RATIO = 0.25;
const ANGER_MARKUP = 1.1;

const round = (v) => Math.round(v * 100) / 100;

function newNegotiation(item, type, bonusRep = 0) {
  const rep = TYPES[type].rep + bonusRep;
  return { rep, maxRep: rep, lastY: null, price: item.price, status: 'open', history: [], line: null };
}

// status: 'open' (haggling continues) | 'deal' (crit/success, price fixed) | 'angered' (Rep 0, 1.1X)
function haggle(neg, { X, type, Y, approach, bonus, rolls, dcMod = 0 }) {
  const T = TYPES[type];
  const dc = T.dc + dcMod; // affinity lowers the DC (hidden)
  if (!T) throw new Error('Unknown merchant type');
  if (!APPROACHES.includes(approach)) throw new Error('Unknown approach');
  if (neg.status !== 'open') throw new Error('This negotiation is over.');
  if (!(Y > 0) || Y >= X) throw new Error('Offer must be below the list price.');

  const entry = { y: Y, approach, rolls: [], roll: null, bonus, total: null, outcome: null, repLoss: 0 };
  let loss = 0;

  if (Y < X * MIN_RATIO) {
    entry.outcome = 'ret';
    loss = 1;
  } else {
    if (neg.lastY != null && Y < neg.lastY) loss += 1; // lower than the previous offer
    neg.lastY = Y;
    if (neg.rep - loss > 0) {
      const a = (X - Y) / 2;
      entry.rolls = rolls.slice();
      entry.roll = Math.max(...rolls);
      entry.total = entry.roll + bonus;
      if (entry.roll === 20 || entry.total >= dc + 5) {
        entry.outcome = 'crit';
        neg.price = round(Y);
        neg.status = 'deal';
      } else if (entry.total >= dc) {
        entry.outcome = 'success';
        neg.price = round(Y + a * (T.u / 2));
        neg.status = 'deal';
      } else {
        entry.outcome = 'fail';
        neg.price = round(X - a * (T.u / 2));
        loss += approach === 'persuasion' ? 1 : 2;
      }
    }
  }

  neg.rep = Math.max(0, neg.rep - loss);
  entry.repLoss = loss;
  if (neg.rep === 0) {
    entry.outcome = 'angered';
    neg.status = 'angered';
    neg.price = round(X * ANGER_MARKUP);
  }
  entry.price = neg.price;
  neg.history.push(entry);
  return entry;
}

// The merchant's mood, shown to the player without numbers.
function moodOf(neg, type) {
  if (!neg) return '😊';
  if (neg.rep <= 0) return '😡';
  const r = neg.rep / TYPES[type].rep;
  return r >= 0.75 ? '😊' : r >= 0.5 ? '😐' : '😠';
}

module.exports = { TYPES, APPROACHES, MIN_RATIO, ANGER_MARKUP, round, newNegotiation, haggle, moodOf };
