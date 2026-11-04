const test = require('node:test');
const assert = require('node:assert/strict');
const BOQ = require('../js/boq.js');
const CERT = require('../js/cert.js');

test('certificate total and amount in words', () => {
  const c = CERT.newCertificate(null, 'Second');
  c.works = [307594, 92921, 127800, 269000, 350000, 200000].map((a) => CERT.work('x', a));
  assert.equal(CERT.total(c), 1347315);
  assert.equal(CERT.inr(CERT.total(c)), '13,47,315');
  assert.equal(CERT.words(1347315), 'Thirteen lakh forty seven thousand three hundred fifteen rupees only');
  assert.equal(CERT.words(100.5), 'One hundred rupees and fifty paise only');
  assert.equal(CERT.inr('1,234.5'), '1,234.50');
});

test('titles, dates and next stage', () => {
  assert.equal(CERT.titleFor('Second'), 'SECOND STAGE CERTIFICATE');
  assert.equal(CERT.titleFor('Completion'), 'COMPLETION CERTIFICATE');
  assert.equal(CERT.dmy('2024-10-08'), '08/10/2024');
  const p = BOQ.newProject('x');
  p.client = 'Owner';
  const a = CERT.newCertificate(p, 'First');
  a.permitNo = 'A1-BA (1)/2022';
  const b = CERT.nextCertificate(p, a);
  assert.equal(b.stage, 'Second');
  assert.equal(b.owner, 'Owner');
  assert.equal(b.permitNo, a.permitNo);
  assert.notEqual(b.id, a.id);
});

test('works from estimate skip headings and use rounded amounts', () => {
  const w = CERT.worksFromEstimate(BOQ.sampleProject());
  assert.equal(w.length, 18);
  assert.equal(w[0].amount, 3502);
  assert.match(w[0].desc, /^EARTH WORK/);
});
