#!/usr/bin/env node
'use strict';
// Rule engine conformance vectors: a port in another language (e.g. C++ for the ESP32) must produce the same results.
// Generate: npm run vectors   Verify: npm test (vectors.test.js fails if the file is stale)
const fs = require('fs');
const path = require('path');
const E = require('../engine');

const OUT = path.join(__dirname, '..', 'conformance', 'haggle-vectors.json');

function run(c) {
  const neg = E.newNegotiation({ price: c.X }, c.type, c.bonusRep || 0);
  const start = { rep: neg.rep, maxRep: neg.maxRep, price: neg.price, status: neg.status };
  const steps = [];
  for (const st of c.steps) {
    let out;
    try {
      const e = E.haggle(neg, { X: c.X, type: c.type, Y: st.Y, approach: st.approach, bonus: st.bonus, rolls: st.rolls, dcMod: st.dcMod || 0 });
      out = { outcome: e.outcome, roll: e.roll, total: e.total, repLoss: e.repLoss, price: e.price, rep: neg.rep, status: neg.status, lastY: neg.lastY };
    } catch (err) { out = { error: err.message }; }
    steps.push({ in: st, out });
  }
  return { X: c.X, type: c.type, bonusRep: c.bonusRep || 0, start, steps };
}

function generate() {
  const cases = [];
  const Xs = [100, 33.33, 1];
  const types = ['generous', 'neutral', 'greedy'];
  const approaches = ['persuasion', 'deception', 'intimidation'];
  for (const X of Xs) for (const type of types) {
    const ys = [X * 0.25 - 0.01, X * 0.25, X * 0.6, X * 0.95].map((v) => Math.round(v * 100) / 100).filter((v) => v > 0 && v < X);
    for (const Y of ys) for (const approach of approaches) for (const roll of [1, 11, 14, 15, 17, 20]) {
      cases.push({ X, type, steps: [{ Y, approach, bonus: 3, rolls: [roll] }] });
    }
  }
  // advantage (two dice), affinity DC reduction, starting patience bonus
  for (const type of types) for (const dcMod of [-1, -2, -3]) for (const rolls of [[3, 16], [10, 10], [19, 4]]) {
    cases.push({ X: 100, type, steps: [{ Y: 60, approach: 'persuasion', bonus: 2, rolls, dcMod }] });
  }
  for (const type of types) cases.push({ X: 100, type, bonusRep: 1, steps: [{ Y: 60, approach: 'deception', bonus: 0, rolls: [1] }, { Y: 60, approach: 'deception', bonus: 0, rolls: [1] }, { Y: 60, approach: 'deception', bonus: 0, rolls: [1] }] });
  // multi-step: failure chain, lower-Y penalty, anger, an offer on a closed negotiation
  for (const type of types) {
    cases.push({ X: 100, type, steps: [
      { Y: 60, approach: 'persuasion', bonus: 0, rolls: [1] },
      { Y: 50, approach: 'persuasion', bonus: 0, rolls: [20] },
      { Y: 40, approach: 'persuasion', bonus: 0, rolls: [1] },
    ] });
    cases.push({ X: 100, type, steps: [
      { Y: 10, approach: 'persuasion', bonus: 0, rolls: [] },
      { Y: 10, approach: 'persuasion', bonus: 0, rolls: [] },
      { Y: 10, approach: 'persuasion', bonus: 0, rolls: [] },
      { Y: 60, approach: 'persuasion', bonus: 0, rolls: [20] },
    ] });
    cases.push({ X: 100, type, steps: [{ Y: 60, approach: 'persuasion', bonus: 20, rolls: [12] }, { Y: 60, approach: 'persuasion', bonus: 0, rolls: [12] }] });
  }
  // invalid inputs
  cases.push({ X: 100, type: 'neutral', steps: [{ Y: 100, approach: 'persuasion', bonus: 0, rolls: [10] }, { Y: 0, approach: 'persuasion', bonus: 0, rolls: [10] }, { Y: 60, approach: 'kandirma', bonus: 0, rolls: [10] }] });
  return {
    about: 'Pazar rule engine conformance vectors. Each case holds the steps applied in order and the expected output.',
    note: 'Prices are rounded to 0.01 gp (Math.round(v*100)/100). Error steps return {error} and do not change the state.',
    types: E.TYPES,
    constants: { MIN_RATIO: E.MIN_RATIO, ANGER_MARKUP: E.ANGER_MARKUP },
    cases: cases.map(run),
  };
}

module.exports = { generate, OUT };
if (require.main === module) {
  const v = generate();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(v) + '\n');
  console.log(`${v.cases.length} cases written: ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}
