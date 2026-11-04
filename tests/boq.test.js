const test = require('node:test');
const assert = require('node:assert/strict');
const BOQ = require('../js/boq.js');

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b}`);

test('row quantity = nos × L × W × H, skipping empty dimensions', () => {
  close(BOQ.rowQty({ nos: 1, l: 32.43, w: 0.6, h: 0.6 }), 11.67);
  close(BOQ.rowQty({ nos: 2, l: 32.43, w: '', h: 3.2 }), 207.55); // wall area
  close(BOQ.rowQty({ nos: '', l: 5, w: 2, h: '' }), 10); // nos defaults to 1
  assert.equal(BOQ.rowQty({ nos: 3 }), 0);
  assert.equal(BOQ.rowQty({ nos: 1, l: 5, qty: 28.6 }), 28.6); // direct quantity wins
});

test('item totals subtract deductions', () => {
  const it = BOQ.item('Laterite masonry', 'm³', 5800, [
    BOQ.row('', 1, 32.43, 0.2, 3.2),
    BOQ.ded('Door D1', 1, 0.9, 0.2, 2.15),
    BOQ.ded('Door D2', 2, 0.8, 0.2, 2.15),
    BOQ.ded('Window W3', 3, 1.5, 0.2, 1.5),
    BOQ.ded('Ventilator', 2, 0.6, 0.2, 0.5),
  ]);
  const t = BOQ.itemTotals(it);
  close(t.gross, 20.76);
  close(t.deduction, 2.55);
  close(t.qty, 18.21);
  close(t.amount, 105619.16, 0.05);
});

test('lump sum items and headings', () => {
  assert.equal(BOQ.itemTotals(BOQ.item('Furniture', 'LS', 250000)).amount, 250000);
  assert.equal(BOQ.itemTotals(BOQ.heading('Ground floor')).amount, 0);
});

test('project totals, serial numbers and tax', () => {
  const p = BOQ.newProject('x');
  p.items = [BOQ.heading('GF'), BOQ.item('a', 'm³', 100, [BOQ.row('', 1, 2, 3, 4)]), BOQ.item('b', 'LS', 50)];
  p.taxPct = 18;
  const t = BOQ.projectTotals(p);
  assert.deepEqual(t.items.map((i) => i.sl), [null, 1, 2]);
  assert.equal(t.subtotal, 2450);
  close(t.tax, 441);
  close(t.total, 2891);
});

test('sample project reproduces the reference estimate', () => {
  const t = BOQ.projectTotals(BOQ.sampleProject());
  assert.equal(t.count, 18);
  // item amounts from the reference estimate sheet
  const ref = [3502.44, 31521.96, 20686.29, 8580, 105619.16, 44537.5, 83564.13, 53301.82, 20500.7, 42528.96, 44301, 350000, 49500, 143875];
  ref.forEach((a, i) => close(t.items[i + 1].amount, a, 0.05));
  // painting: the sheet shows 7.30 and 2.66 m² for slabs S5/S6, but 2.93×8.30×0.12 = 2.92 and 4.03×2.20×0.12 = 1.06,
  // so the correct quantity is 570.67 m² (sheet: 576.67) and the total is ≈ 1,662,774 (sheet: 1,663,493)
  close(t.items[15].qty, 570.67);
  close(t.total, 1662774.22, 0.05);
});

test('amount in words (Indian system)', () => {
  assert.equal(BOQ.amountInWords(1663493), 'Sixteen Lakh Sixty Three Thousand Four Hundred Ninety Three Rupees And Zero Paisa Only');
  assert.equal(BOQ.amountInWords(12345678.5), 'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees And Fifty Paisa Only');
  assert.equal(BOQ.intToWords(0), 'Zero');
  assert.equal(BOQ.intToWords(100000), 'One Lakh');
});

test('clone and normalize', () => {
  const p = BOQ.sampleProject();
  const c = BOQ.cloneProject(p);
  assert.notEqual(c.id, p.id);
  assert.notEqual(c.items[1].id, p.items[1].id);
  close(BOQ.projectTotals(c).total, BOQ.projectTotals(p).total, 1e-6);
  const n = BOQ.normalizeProject(JSON.parse(JSON.stringify(p)));
  close(BOQ.projectTotals(n).total, BOQ.projectTotals(p).total, 1e-6);
  assert.throws(() => BOQ.normalizeProject({ name: 'bad' }));
});
