/*
 * RCC Calculator – project estimate (bill of quantities) engine.
 * Pure functions only (no DOM), so they can be unit-tested with Node.
 *
 * A project has items. Each item has measurement rows:
 *   quantity of a row = nos × length × width × height/depth
 * Empty dimensions are skipped, so the same row works for volume (L × W × D),
 * area (L × H, e.g. plastering a wall) or running length. A row can also hold a
 * direct quantity (e.g. 2800 sq ft) that is used instead of the dimensions.
 * Rows marked as a deduction (doors, windows, ventilators…) are subtracted.
 *
 *   item quantity = Σ rows − Σ deductions
 *   item amount   = item quantity × rate          (lump-sum items: amount = rate)
 *   project total = Σ item amounts
 */
(function (root) {
  'use strict';

  const UNITS = ['m³', 'm²', 'm', 'sq ft', 'cft', 'rft', 'nos', 'kg', 'LS'];

  const num = (v) => {
    if (v === '' || v == null) return NaN;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : NaN;
  };

  /** Quantity of one measurement row (always ≥ 0; the sign comes from `ded`). */
  function rowQty(row) {
    const direct = num(row.qty);
    if (Number.isFinite(direct)) return Math.abs(direct);
    const dims = [row.l, row.w, row.h].map(num).filter(Number.isFinite);
    if (!dims.length) return 0;
    const nos = num(row.nos);
    const n = Number.isFinite(nos) ? nos : 1;
    return Math.abs(dims.reduce((a, b) => a * b, n));
  }

  /** Totals of an item: gross, deduction, net quantity and amount. */
  function itemTotals(item) {
    if (item.kind === 'heading') return { gross: 0, deduction: 0, qty: 0, rate: 0, amount: 0 };
    const rate = num(item.rate) || 0;
    if (item.unit === 'LS') return { gross: 1, deduction: 0, qty: 1, rate, amount: rate };
    let gross = 0;
    let deduction = 0;
    (item.rows || []).forEach((r) => {
      const q = rowQty(r);
      if (r.ded) deduction += q;
      else gross += q;
    });
    const qty = gross - deduction;
    return { gross, deduction, qty, rate, amount: qty * rate };
  }

  /** Totals for a whole project, with serial numbers for the items. */
  function projectTotals(project) {
    let sl = 0;
    let subtotal = 0;
    const items = (project.items || []).map((it) => {
      const t = itemTotals(it);
      const out = Object.assign({ id: it.id, sl: it.kind === 'heading' ? null : ++sl }, t);
      subtotal += t.amount;
      return out;
    });
    const taxPct = num(project.taxPct) || 0;
    const tax = (subtotal * taxPct) / 100;
    const total = subtotal + tax;
    return { items, subtotal, taxPct, tax, total, count: sl };
  }

  // ---------------------------------------------------------------- amount in words (Indian system)
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function below100(n) {
    if (n < 20) return ONES[n];
    return (TENS[Math.floor(n / 10)] + ' ' + ONES[n % 10]).trim();
  }
  function below1000(n) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return [h ? ONES[h] + ' Hundred' : '', r ? below100(r) : ''].filter(Boolean).join(' ');
  }
  /** Whole number in Indian words: crore, lakh, thousand, hundred. */
  function intToWords(n) {
    n = Math.floor(Math.abs(n));
    if (n === 0) return 'Zero';
    const parts = [];
    const crore = Math.floor(n / 1e7);
    n %= 1e7;
    if (crore) parts.push(intToWords(crore) + ' Crore');
    const lakh = Math.floor(n / 1e5);
    n %= 1e5;
    if (lakh) parts.push(below100(lakh) + ' Lakh');
    const th = Math.floor(n / 1000);
    n %= 1000;
    if (th) parts.push(below100(th) + ' Thousand');
    if (n) parts.push(below1000(n));
    return parts.join(' ');
  }
  /** e.g. 1663493 → "Sixteen Lakh Sixty Three Thousand Four Hundred Ninety Three Rupees And Zero Paisa Only" */
  function amountInWords(amount) {
    const a = Math.round(Math.abs(num(amount) || 0) * 100);
    const rupees = Math.floor(a / 100);
    const paisa = a % 100;
    return `${intToWords(rupees)} Rupees And ${intToWords(paisa)} Paisa Only`;
  }

  // ---------------------------------------------------------------- helpers to build projects
  let seq = 0;
  const uid = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);
  const row = (desc, nos, l, w, h, extra) => Object.assign({ id: uid(), desc: desc || '', nos: nos ?? '', l: l ?? '', w: w ?? '', h: h ?? '', qty: '', ded: false }, extra);
  const ded = (desc, nos, l, w, h, extra) => row(desc, nos, l, w, h, Object.assign({ ded: true }, extra));
  const direct = (desc, qty) => row(desc, 1, '', '', '', { qty });
  const item = (desc, unit, rate, rows) => ({ id: uid(), kind: 'item', desc, unit, rate: rate ?? '', rows: rows || [] });
  const heading = (desc) => ({ id: uid(), kind: 'heading', desc, unit: '', rate: '', rows: [] });

  function newProject(name) {
    return {
      id: uid(),
      name: name || 'New project',
      client: '',
      place: '',
      workType: '',
      date: new Date().toISOString().slice(0, 10),
      estNo: '',
      title: 'Estimate for construction of residential building',
      taxPct: '',
      items: [heading('Ground floor'), item('', 'm³', '', [row('', 1)])],
    };
  }

  /** Deep copy with fresh ids. */
  function cloneProject(p, name) {
    const c = JSON.parse(JSON.stringify(p));
    c.id = uid();
    c.name = name || p.name + ' (copy)';
    c.items.forEach((it) => {
      it.id = uid();
      (it.rows || []).forEach((r) => (r.id = uid()));
    });
    return c;
  }
  function cloneItem(it) {
    const c = JSON.parse(JSON.stringify(it));
    c.id = uid();
    (c.rows || []).forEach((r) => (r.id = uid()));
    return c;
  }

  /** Make sure data loaded from storage or a file has the expected shape. */
  function normalizeProject(p) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.items)) throw new Error('Not a valid project file');
    const base = newProject(p.name);
    const out = Object.assign(base, p, { id: p.id || base.id });
    out.items = p.items.map((it) => ({
      id: it.id || uid(),
      kind: it.kind === 'heading' ? 'heading' : 'item',
      desc: String(it.desc || ''),
      unit: UNITS.includes(it.unit) ? it.unit : it.kind === 'heading' ? '' : 'm³',
      rate: it.rate ?? '',
      rows: Array.isArray(it.rows) ? it.rows.map((r) => Object.assign(row(), r, { id: r.id || uid(), ded: !!r.ded })) : [],
    }));
    return out;
  }

  /** A worked example: residential repair / renovation (extended rooms). */
  function sampleProject() {
    const p = newProject('Sample – residential renovation');
    p.workType = 'Residential';
    p.title = 'Estimation for construction of residential building – repair renovation work';
    const openings = (asDeduction) => {
      const f = asDeduction ? ded : row;
      return [f('Door D1', 1, 0.9, 0.2, 2.15), f('Door D2', 2, 0.8, 0.2, 2.15), f('Window W3', 3, 1.5, 0.2, 1.5), f('Ventilator', 2, 0.6, 0.2, 0.5)];
    };
    p.items = [
      heading('Ground floor'),
      item('Earth work excavation all classes of soil etc. complete for foundation – for extended rooms', 'm³', 300, [row('', 1, 32.43, 0.6, 0.6)]),
      item('Dry rubble masonry with hard stone in foundation – for extended rooms', 'm³', 2700, [row('', 1, 32.43, 0.6, 0.6)]),
      item('Basement using laterite masonry – for extended rooms', 'm³', 3150, [row('', 1, 32.43, 0.45, 0.45)]),
      item('Filling earth in basement, sides of foundation etc. in layers not exceeding 20 cm, ramming and watering', 'm³', 300, [direct('', 28.6)]),
      item('Laterite masonry in CM (1:6) including transportation and labour charges – for extended rooms', 'm³', 5800, [row('', 1, 32.43, 0.2, 3.2), ...openings(true)]),
      item('Supplying and fixing of doors and windows including transportation and labour charges', 'm²', 17500, openings(false)),
      item('RCC (1:2:4) using 20 mm metal including cost and conveyance of all materials and labour', 'm³', 18500, [
        row('Lintel', 1, 32.43, 0.2, 0.15),
        row('Slab S1', 1, 5.1, 3.4, 0.12),
        row('Slab S2', 1, 3.35, 3.64, 0.12),
      ]),
      item('Plastering with CM (1:5) 10 mm thick including labour and transportation', 'm²', 260, [row('Wall', 2, 32.43, '', 3.2), ...openings(true)]),
      item('Applying putty including all cost of material and labour', 'm²', 100, [row('Wall', 2, 32.43, '', 3.2), ...openings(true)]),
      item('Concrete flooring with cement concrete 1:4:8', 'm³', 12000, [row('Floor F1', 1, 5.1, 3.4, 0.12), row('Floor F2', 1, 3.35, 3.64, 0.12)]),
      item('Flooring with Italian marble including all cost of material and labour', 'm²', 1500, [row('Floor F1', 1, 5.1, 3.4), row('Floor F2', 1, 3.35, 3.64)]),
      item('Natural paving stone 50 mm thick for front, side and back yard', 'sq ft', 125, [direct('', 2800)]),
      item('Waterproofing for all sunshades and first floor roof top', 'sq ft', 45, [direct('', 1100)]),
      item('Flooring with GVT tile including all cost of material and labour', 'sq ft', 125, [direct('', 1151)]),
      item('Single coat painting over the existing surface including material and labour', 'm²', 120, [
        row('Wall', 2, 74.43, '', 3.4),
        row('Columns', 1, 0.2, 0.2, 3.4),
        row('Lintel', 1, 89.73, 0.2, 0.18),
        row('Slab S1', 1, 3.73, 6.52, 0.12),
        row('Slab S2', 1, 2.36, 1.96, 0.12),
        row('Slab S3', 1, 4.66, 4.33, 0.12),
        row('Slab S4', 1, 5.69, 6.49, 0.12),
        row('Slab S5', 1, 2.93, 8.3, 0.12),
        row('Slab S6', 1, 4.03, 2.2, 0.12),
        row('Beam 1', 1, 3.63, 0.2, 0.3),
        row('Beam 2', 1, 4.11, 0.2, 0.3),
        row('Beam 3', 1, 4.1, 0.2, 0.3),
        row('Beam 4', 1, 2.1, 0.2, 0.3),
        row('Basement', 1, 89.73, '', 0.6),
        ded('Door / window / ventilator deduction', 1, '', '', '', { qty: 7.8 }),
      ]),
      item('Interior design works', 'm²', 1650, [direct('', 116.53)]),
      item('Furniture items', 'LS', 250000),
      item('Unforeseen items, contingencies and other overheads', 'LS', 150000),
    ];
    return p;
  }

  const api = { UNITS, rowQty, itemTotals, projectTotals, intToWords, amountInWords, newProject, cloneProject, cloneItem, normalizeProject, sampleProject, row, ded, item, heading, uid };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BOQ = api;
})(typeof window !== 'undefined' ? window : globalThis);
