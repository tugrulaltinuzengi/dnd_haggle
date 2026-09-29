'use strict';
// Pazarlık kuralları (DM_PAKETI.md). Saf fonksiyonlar, bağımlılık yok.

const TYPES = {
  comert: { u: 0.5, dc: 12, rep: 4, name: 'Cömert' },
  notr: { u: 1.0, dc: 15, rep: 3, name: 'Nötr' },
  acgozlu: { u: 1.5, dc: 18, rep: 2, name: 'Açgözlü' },
};
const APPROACHES = ['persuasion', 'deception', 'intimidation'];
const MIN_RATIO = 0.25;
const ANGER_MARKUP = 1.1;
const GAMBLE_RATIO = 0.5;

const round = (v) => Math.round(v * 100) / 100;

function newNegotiation(item, type) {
  const rep = TYPES[type].rep;
  return { rep, maxRep: rep, lastY: null, price: item.price, status: 'open', history: [], line: null };
}

// status: 'open' (pazarlık sürüyor) | 'deal' (kritik/başarı, fiyat sabit) | 'angered' (Rep 0, 1.1X)
function haggle(neg, { X, type, Y, approach, bonus, rolls }) {
  const T = TYPES[type];
  if (!T) throw new Error('Bilinmeyen satıcı tipi');
  if (!APPROACHES.includes(approach)) throw new Error('Bilinmeyen yaklaşım');
  if (neg.status !== 'open') throw new Error('Bu pazarlık bitti.');
  if (!(Y > 0) || Y >= X) throw new Error('Teklif etiket fiyatının altında olmalı.');

  const entry = { y: Y, approach, rolls: [], roll: null, bonus, total: null, outcome: null, repLoss: 0 };
  let loss = 0;

  if (Y < X * MIN_RATIO) {
    entry.outcome = 'ret';
    loss = 1;
  } else {
    if (neg.lastY != null && Y < neg.lastY) loss += 1; // önceki tekliften düşük
    neg.lastY = Y;
    if (neg.rep - loss > 0) {
      const a = (X - Y) / 2;
      entry.rolls = rolls.slice();
      entry.roll = Math.max(...rolls);
      entry.total = entry.roll + bonus;
      if (entry.roll === 20 || entry.total >= T.dc + 5) {
        entry.outcome = 'crit';
        neg.price = round(Y);
        neg.status = 'deal';
      } else if (entry.total >= T.dc) {
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

// Oyuncuya sayı göstermeden satıcının ruh hali.
function moodOf(neg, type) {
  if (!neg) return '😊';
  if (neg.rep <= 0) return '😡';
  const r = neg.rep / TYPES[type].rep;
  return r >= 0.75 ? '😊' : r >= 0.5 ? '😐' : '😠';
}

module.exports = { TYPES, APPROACHES, MIN_RATIO, ANGER_MARKUP, GAMBLE_RATIO, round, newNegotiation, haggle, moodOf };
