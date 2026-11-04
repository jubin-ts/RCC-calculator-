const test = require('node:test');
const assert = require('node:assert/strict');
const RCC = require('../js/calc.js');

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b}`);

test('unit weight of bars (d²/162)', () => {
  close(RCC.unitWeight(8), 0.395, 0.001);
  close(RCC.unitWeight(10), 0.617, 0.001);
  close(RCC.unitWeight(12), 0.889, 0.001);
  close(RCC.unitWeight(16), 1.580, 0.001);
});

test('concrete M20, 1 m³ – textbook values', () => {
  const r = RCC.concrete({ volume: 1, grade: 'M20' });
  close(r.dryVolume, 1.54);
  close(r.cement.bags, 8.064, 0.001); // 0.28 m³ × 1440 / 50
  close(r.cement.kg, 403.2, 0.1);
  close(r.sand.m3, 0.42);
  close(r.sand.cft, 14.83, 0.01);
  close(r.aggregate.m3, 0.84);
  close(r.aggregate.cft, 29.66, 0.01);
  close(r.water.litres, 201.6, 0.1);
  assert.equal(r.cement.bagsRounded, 9);
});

test('concrete all grades produce sensible cement content', () => {
  const bags = ['M25', 'M20', 'M15', 'M10'].map((g) => RCC.concrete({ volume: 1, grade: g }).cement.bags);
  close(bags[0], 11.088, 0.001); // 1.54/4
  close(bags[2], 6.336, 0.001); // 1.54/7
  close(bags[3], 4.4352, 0.001); // 1.54/10
  for (let i = 1; i < bags.length; i++) assert.ok(bags[i] < bags[i - 1]);
});

test('concrete wastage and custom ratio', () => {
  const r = RCC.concrete({ volume: 10, grade: 'CUSTOM', ratio: [1, 2, 3], wc: 0.5, wastage: 5 });
  close(r.volume, 10.5);
  close(r.cement.m3, (10.5 * 1.54) / 6);
});

test('concrete rejects zero volume', () => {
  assert.throws(() => RCC.concrete({ volume: 0, grade: 'M20' }));
});

test('barCount handles floating point edges', () => {
  assert.equal(RCC.barCount(3, 0.15), 21);
  assert.equal(RCC.barCount(0.3, 0.1), 4);
  assert.equal(RCC.barCount(0, 0.1), 0);
});

test('one-way slab steel', () => {
  const r = RCC.slab({
    length: 5, width: 4, thickness: 0.15, spacingShort: 0.15, spacingLong: 0.2,
    type: 'one', diaShort: 10, diaLong: 8, cover: 2,
  });
  assert.equal(r.shorterSpan, 4);
  // main bars: across 5 − 0.04 = 4.96 → floor(33.07)+1 = 34 bars, each 3.96 m
  assert.equal(r.rows[0].count, 34);
  close(r.rows[0].cutLength, 3.96, 1e-9);
  // distribution: across 3.96 → floor(19.8)+1 = 20 bars, each 4.96 m
  assert.equal(r.rows[1].count, 20);
  assert.match(r.rows[1].name, /Distribution/);
  const expected = 34 * 3.96 * RCC.unitWeight(10) + 20 * 4.96 * RCC.unitWeight(8);
  close(r.totalWeight, expected, 1e-6);
  close(r.concreteVolume, 3);
});

test('two-way slab with cranks adds length', () => {
  const base = { length: 4, width: 4, thickness: 0.15, spacingShort: 0.15, type: 'two', diaShort: 10, diaLong: 10, cover: 2 };
  const a = RCC.slab(base);
  const b = RCC.slab({ ...base, crank: true });
  assert.ok(b.totalWeight > a.totalWeight);
  assert.ok(b.rows.some((r) => /cranked/.test(r.name)));
  assert.match(a.rows[1].name, /Main bars \(longer/);
});

test('beam steel and stirrups', () => {
  const r = RCC.beam({
    length: 4, width: 0.23, depth: 0.45, cover: 2.5,
    topDia: 12, topCount: 2, bottomDia: 16, bottomCount: 3,
    stirrupDia: 8, stirrupSpacing: 0.15,
  });
  assert.equal(r.rows.length, 3);
  assert.equal(r.rows[0].count, 2);
  assert.equal(r.rows[1].count, 3);
  // stirrup: a = 0.23−0.05−0.008 = 0.172, b = 0.45−0.05−0.008 = 0.392
  close(r.stirrup.length, 2 * (0.172 + 0.392) + 8 * 0.008, 1e-9);
  assert.equal(r.stirrup.count, 27); // (4−0.05)/0.15 = 26.33 → 26 + 1
  close(r.concreteVolume, 4 * 0.23 * 0.45, 1e-9);
});

test('beam quantity multiplies', () => {
  const p = { length: 3, width: 0.23, depth: 0.3, topDia: 10, topCount: 2, bottomDia: 12, bottomCount: 2, stirrupDia: 8, stirrupSpacing: 0.15 };
  close(RCC.beam({ ...p, qty: 3 }).totalWeight, 3 * RCC.beam(p).totalWeight, 1e-9);
});

test('column rectangular and circular', () => {
  const r = RCC.column({ width: 0.23, depth: 0.3, height: 3, cover: 4, barCount: 4, barDia: 12, stirrupDia: 8, stirrupSpacing: 0.15 });
  assert.equal(r.rows[0].count, 4);
  close(r.rows[0].cutLength, 3);
  assert.equal(r.stirrup.count, 21);
  close(r.steelPercent, (4 * Math.PI * 36) / (0.23 * 0.3 * 1e6) * 100, 1e-9);

  const c = RCC.column({ shape: 'circle', width: 0.45, height: 3, cover: 4, barCount: 6, barDia: 16, stirrupDia: 8, stirrupSpacing: 0.15 });
  close(c.concreteVolume, (Math.PI * 0.45 * 0.45) / 4 * 3, 1e-9);
  assert.match(c.rows[1].name, /Circular/);
});

test('cover too large throws', () => {
  assert.throws(() => RCC.column({ width: 0.1, depth: 0.1, height: 3, cover: 5, barCount: 4, barDia: 12, stirrupDia: 8, stirrupSpacing: 0.15 }));
});

test('wastage applies to steel', () => {
  const p = { width: 0.3, depth: 0.3, height: 3, barCount: 4, barDia: 12, stirrupDia: 8, stirrupSpacing: 0.15 };
  close(RCC.column({ ...p, wastage: 10 }).totalWeight, RCC.column(p).totalWeight * 1.1, 1e-9);
});

test('cost and conversions', () => {
  const c = RCC.cost({ cementBags: 10, sandCft: 20, aggCft: 30, steelKg: 100 }, { cement: 400, sand: 50, aggregate: 40, steel: 65 });
  assert.equal(c.total, 4000 + 1000 + 1200 + 6500);
  close(RCC.convert(1, 'm³', 'cft', 'volume'), 35.3147, 1e-4);
  close(RCC.convert(1, 'brass', 'cft', 'volume'), 100, 1e-9);
  close(RCC.convert(10, 'ft', 'm', 'length'), 3.048, 1e-9);
});
