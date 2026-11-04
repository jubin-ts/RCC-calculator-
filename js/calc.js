/*
 * RCC Calculator – calculation engine.
 * Pure functions only (no DOM), so they can be unit-tested with Node.
 *
 * Conventions used (IS 456 / common Indian site practice):
 *   - Dry volume factor of concrete .............. 1.54
 *   - Density of cement .......................... 1440 kg/m³
 *   - Weight of one cement bag ................... 50 kg  (≈ 0.0347 m³)
 *   - 1 m³ ....................................... 35.3147 cft
 *   - Unit weight of steel bar ................... d² / 162 kg/m  (d in mm)
 *   - Standard length of a TMT bar ............... 12 m
 */
(function (root) {
  'use strict';

  const CONST = {
    DRY_FACTOR: 1.54,
    CEMENT_DENSITY: 1440, // kg/m³
    BAG_WEIGHT: 50, // kg
    CFT_PER_M3: 35.3147,
    BAR_LENGTH: 12, // m
    SAND_DENSITY: 1600, // kg/m³ (approx, loose dry)
    AGG_DENSITY: 1450, // kg/m³ (approx, loose)
  };

  /** Nominal mix ratios (cement : sand : aggregate) and typical w/c ratio. */
  const GRADES = {
    M25: { ratio: [1, 1, 2], wc: 0.45, label: 'M25 (1 : 1 : 2)' },
    M20: { ratio: [1, 1.5, 3], wc: 0.5, label: 'M20 (1 : 1.5 : 3)' },
    M15: { ratio: [1, 2, 4], wc: 0.55, label: 'M15 (1 : 2 : 4)' },
    M10: { ratio: [1, 3, 6], wc: 0.6, label: 'M10 (1 : 3 : 6)' },
  };

  const STANDARD_DIAS = [6, 8, 10, 12, 16, 20, 25, 28, 32, 36, 40];

  const num = (v, d = 0) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : d;
  };

  /** Unit weight of a bar in kg/m. */
  const unitWeight = (dia) => (dia * dia) / 162;

  /** Number of bars that fit in `length` at `spacing` (both ends included). */
  const barCount = (length, spacing) => {
    if (!(length > 0) || !(spacing > 0)) return 0;
    // small epsilon avoids 2.9999999 -> 2 floating point issues
    return Math.floor(length / spacing + 1e-9) + 1;
  };

  // ---------------------------------------------------------------------------
  // 1. CONCRETE
  // ---------------------------------------------------------------------------
  /**
   * @param {object} p
   * @param {number} p.volume       wet volume of concrete in m³
   * @param {string} [p.grade]      M25 | M20 | M15 | M10 | CUSTOM
   * @param {number[]} [p.ratio]    custom ratio [c, s, a]
   * @param {number} [p.wc]         water-cement ratio
   * @param {number} [p.wastage]    wastage in %
   * @param {number} [p.dryFactor]  dry volume factor (default 1.54)
   */
  function concrete(p) {
    const grade = GRADES[p.grade];
    const ratio = (p.ratio && p.ratio.length === 3 ? p.ratio : grade ? grade.ratio : [1, 1.5, 3]).map((x) => num(x));
    const wc = num(p.wc, grade ? grade.wc : 0.5);
    const wastage = num(p.wastage, 0);
    const dryFactor = num(p.dryFactor, CONST.DRY_FACTOR);
    const wetVolume = num(p.volume);

    const sum = ratio[0] + ratio[1] + ratio[2];
    if (!(wetVolume > 0) || !(sum > 0)) {
      throw new Error('Enter a concrete volume greater than zero.');
    }

    const volume = wetVolume * (1 + wastage / 100);
    const dryVolume = volume * dryFactor;

    const cementM3 = (dryVolume * ratio[0]) / sum;
    const sandM3 = (dryVolume * ratio[1]) / sum;
    const aggM3 = (dryVolume * ratio[2]) / sum;

    const cementKg = cementM3 * CONST.CEMENT_DENSITY;
    const cementBags = cementKg / CONST.BAG_WEIGHT;
    const waterL = cementKg * wc; // 1 kg water = 1 litre

    return {
      grade: p.grade,
      ratio,
      wc,
      wastage,
      dryFactor,
      wetVolume,
      volume,
      dryVolume,
      cement: { m3: cementM3, kg: cementKg, bags: cementBags, bagsRounded: Math.ceil(cementBags - 1e-9) },
      sand: { m3: sandM3, cft: sandM3 * CONST.CFT_PER_M3, tonnes: (sandM3 * CONST.SAND_DENSITY) / 1000 },
      aggregate: { m3: aggM3, cft: aggM3 * CONST.CFT_PER_M3, tonnes: (aggM3 * CONST.AGG_DENSITY) / 1000 },
      water: { litres: waterL },
    };
  }

  // ---------------------------------------------------------------------------
  // Steel helpers
  // ---------------------------------------------------------------------------
  /** Build a bar-schedule row. */
  function barRow(name, dia, count, cutLength, qty = 1) {
    const nos = count * qty;
    const totalLength = nos * cutLength;
    const weight = totalLength * unitWeight(dia);
    return {
      name,
      dia,
      count: nos,
      cutLength,
      totalLength,
      unitWeight: unitWeight(dia),
      weight,
      bars12m: Math.ceil(totalLength / CONST.BAR_LENGTH - 1e-9),
    };
  }

  /** Summarise rows: totals + weight grouped by diameter. */
  function summarise(rows, wastage = 0) {
    const byDia = {};
    let weight = 0;
    let length = 0;
    rows.forEach((r) => {
      weight += r.weight;
      length += r.totalLength;
      if (!byDia[r.dia]) byDia[r.dia] = { dia: r.dia, length: 0, weight: 0, bars12m: 0 };
      byDia[r.dia].length += r.totalLength;
      byDia[r.dia].weight += r.weight;
    });
    const f = 1 + num(wastage) / 100;
    Object.values(byDia).forEach((d) => {
      d.length *= f;
      d.weight *= f;
      d.bars12m = Math.ceil(d.length / CONST.BAR_LENGTH - 1e-9);
    });
    const netWeight = weight;
    weight *= f;
    length *= f;
    return {
      rows,
      byDia: Object.values(byDia).sort((a, b) => a.dia - b.dia),
      netWeight,
      totalWeight: weight,
      totalLength: length,
      tonnes: weight / 1000,
      wastage: num(wastage),
    };
  }

  const req = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };

  // ---------------------------------------------------------------------------
  // 2a. SLAB
  // ---------------------------------------------------------------------------
  /**
   * @param {object} p
   * @param {number} p.length        m
   * @param {number} p.width         m
   * @param {number} p.thickness     m
   * @param {number} p.spacingShort  m – spacing of bars running along the shorter span
   * @param {number} [p.spacingLong] m – spacing of bars running along the longer span (defaults to spacingShort)
   * @param {'one'|'two'} p.type     one way / two way
   * @param {number} p.diaShort      mm – bars along the shorter span (main bars)
   * @param {number} p.diaLong       mm – bars along the longer span (distribution / main for two-way)
   * @param {number} [p.cover]       cm – clear cover (default 2 cm)
   * @param {boolean} [p.crank]      alternate bars cranked at both ends
   * @param {number} [p.extra]       m – extra length per bar (anchorage / bearing / laps)
   * @param {number} [p.wastage]     %
   */
  function slab(p) {
    const L = num(p.length);
    const W = num(p.width);
    const t = num(p.thickness);
    const sS = num(p.spacingShort);
    const sL = num(p.spacingLong, sS) || sS;
    const dS = num(p.diaShort);
    const dL = num(p.diaLong);
    const c = num(p.cover, 2) / 100; // cm -> m
    const extra = num(p.extra, 0);
    const type = p.type === 'two' ? 'two' : 'one';

    req(L > 0 && W > 0, 'Enter slab length and width.');
    req(t > 0, 'Enter slab thickness.');
    req(sS > 0, 'Enter spacing of bars.');
    req(dS > 0 && dL > 0, 'Enter bar diameters.');
    req(t > 2 * c, 'Clear cover is too large for this slab thickness.');

    const Lx = Math.min(L, W); // shorter span
    const Ly = Math.max(L, W); // longer span

    // Bars along the shorter span (main bars) are distributed across the longer span.
    const nShort = barCount(Ly - 2 * c, sS);
    const baseShort = Lx - 2 * c + extra;
    // Bars along the longer span are distributed across the shorter span.
    const nLong = barCount(Lx - 2 * c, sL);
    const baseLong = Ly - 2 * c + extra;

    const rows = [];
    const crankD = (dia) => Math.max(t - 2 * c - dia / 1000, 0); // effective crank height
    const crankAdd = (dia) => 2 * 0.42 * crankD(dia); // crank at both ends

    const addSet = (label, dia, n, base, cranked) => {
      if (cranked && n > 0) {
        const nCrank = Math.floor(n / 2);
        const nStraight = n - nCrank;
        rows.push(barRow(`${label} – straight`, dia, nStraight, base));
        if (nCrank > 0) rows.push(barRow(`${label} – cranked`, dia, nCrank, base + crankAdd(dia)));
      } else {
        rows.push(barRow(label, dia, n, base));
      }
    };

    addSet('Main bars (shorter span)', dS, nShort, baseShort, !!p.crank);
    addSet(
      type === 'two' ? 'Main bars (longer span)' : 'Distribution bars (longer span)',
      dL,
      nLong,
      baseLong,
      !!p.crank && type === 'two'
    );

    const steel = summarise(rows, p.wastage);
    return {
      type,
      shorterSpan: Lx,
      longerSpan: Ly,
      concreteVolume: L * W * t,
      area: L * W,
      kgPerM3: steel.totalWeight / (L * W * t),
      ...steel,
    };
  }

  // ---------------------------------------------------------------------------
  // Stirrup / tie cutting lengths
  // ---------------------------------------------------------------------------
  /**
   * Rectangular 2-legged stirrup with two 135° hooks.
   *   a, b = centre-line dimensions = (B − 2c − ds), (D − 2c − ds)
   *   Cutting length = 2(a + b) + 2 × 10ds (hooks) − 3 × 2ds (90° bends) − 2 × 3ds (135° bends)
   *                  = 2(a + b) + 8ds
   */
  function rectStirrupLength(B, D, c, ds) {
    const d = ds / 1000;
    const a = B - 2 * c - d;
    const b = D - 2 * c - d;
    return { a, b, length: 2 * (a + b) + 8 * d };
  }

  /** Circular tie: π × (Dc) + 2 × 10ds − 2 × 3ds, Dc = D − 2c − ds */
  function circularTieLength(Dia, c, ds) {
    const d = ds / 1000;
    const dc = Dia - 2 * c - d;
    return { a: dc, b: dc, length: Math.PI * dc + 14 * d };
  }

  // ---------------------------------------------------------------------------
  // 2b. BEAM
  // ---------------------------------------------------------------------------
  /**
   * @param {object} p
   * @param {number} p.length         m – beam length
   * @param {number} p.width          m – beam width (B)
   * @param {number} p.depth          m – beam overall depth (D)
   * @param {number} [p.cover]        cm (default 2.5)
   * @param {number} p.topDia         mm
   * @param {number} p.topCount       nos
   * @param {number} p.bottomDia      mm
   * @param {number} p.bottomCount    nos
   * @param {number} p.stirrupDia     mm
   * @param {number} p.stirrupSpacing m
   * @param {number} [p.extra]        m – extra per main bar (anchorage / development length)
   * @param {number} [p.qty]          number of identical beams
   * @param {number} [p.wastage]      %
   */
  function beam(p) {
    const L = num(p.length);
    const B = num(p.width);
    const D = num(p.depth);
    const c = num(p.cover, 2.5) / 100;
    const qty = Math.max(1, Math.round(num(p.qty, 1)));
    const extra = num(p.extra, 0);

    req(L > 0, 'Enter beam length.');
    req(B > 0 && D > 0, 'Enter beam width and depth.');
    req(num(p.stirrupSpacing) > 0, 'Enter spacing of stirrups.');
    req(num(p.stirrupDia) > 0, 'Enter stirrup diameter.');
    req(B > 2 * c && D > 2 * c, 'Clear cover is too large for this beam section.');

    const mainLen = L - 2 * c + extra;
    const rows = [];
    if (num(p.topCount) > 0 && num(p.topDia) > 0) rows.push(barRow('Top bars', num(p.topDia), Math.round(num(p.topCount)), mainLen, qty));
    if (num(p.bottomCount) > 0 && num(p.bottomDia) > 0)
      rows.push(barRow('Bottom bars', num(p.bottomDia), Math.round(num(p.bottomCount)), mainLen, qty));

    const st = rectStirrupLength(B, D, c, num(p.stirrupDia));
    const nSt = barCount(L - 2 * c, num(p.stirrupSpacing));
    rows.push(barRow('Stirrups', num(p.stirrupDia), nSt, st.length, qty));

    const steel = summarise(rows, p.wastage);
    const vol = L * B * D * qty;
    return {
      qty,
      stirrup: { ...st, count: nSt },
      concreteVolume: vol,
      kgPerM3: steel.totalWeight / vol,
      ...steel,
    };
  }

  // ---------------------------------------------------------------------------
  // 2c. COLUMN (PILLAR)
  // ---------------------------------------------------------------------------
  /**
   * @param {object} p
   * @param {'rect'|'circle'} [p.shape]
   * @param {number} p.width          m (or diameter for circular)
   * @param {number} [p.depth]        m (rectangular only)
   * @param {number} p.height         m
   * @param {number} [p.cover]        cm (default 4)
   * @param {number} p.barCount       nos
   * @param {number} p.barDia         mm
   * @param {number} p.stirrupDia     mm
   * @param {number} p.stirrupSpacing m
   * @param {number} [p.extra]        m – extra per vertical bar (lap / footing anchorage)
   * @param {number} [p.qty]          number of identical columns
   * @param {number} [p.wastage]      %
   */
  function column(p) {
    const shape = p.shape === 'circle' ? 'circle' : 'rect';
    const B = num(p.width);
    const D = shape === 'circle' ? B : num(p.depth);
    const H = num(p.height);
    const c = num(p.cover, 4) / 100;
    const qty = Math.max(1, Math.round(num(p.qty, 1)));
    const extra = num(p.extra, 0);

    req(H > 0, 'Enter column height.');
    req(B > 0 && D > 0, shape === 'circle' ? 'Enter column diameter.' : 'Enter column width and depth.');
    req(num(p.barCount) > 0 && num(p.barDia) > 0, 'Enter number and diameter of bars.');
    req(num(p.stirrupSpacing) > 0, 'Enter spacing of stirrups.');
    req(num(p.stirrupDia) > 0, 'Enter stirrup diameter.');
    req(B > 2 * c && D > 2 * c, 'Clear cover is too large for this column section.');

    const rows = [];
    rows.push(barRow('Vertical (main) bars', num(p.barDia), Math.round(num(p.barCount)), H + extra, qty));

    const st = shape === 'circle' ? circularTieLength(B, c, num(p.stirrupDia)) : rectStirrupLength(B, D, c, num(p.stirrupDia));
    const nSt = barCount(H, num(p.stirrupSpacing));
    rows.push(barRow(shape === 'circle' ? 'Circular ties' : 'Stirrups / ties', num(p.stirrupDia), nSt, st.length, qty));

    const steel = summarise(rows, p.wastage);
    const area = shape === 'circle' ? (Math.PI * B * B) / 4 : B * D;
    const vol = area * H * qty;
    const asc = (Math.round(num(p.barCount)) * Math.PI * Math.pow(num(p.barDia), 2)) / 4; // mm²
    const steelPct = (asc / (area * 1e6)) * 100;
    return {
      shape,
      qty,
      stirrup: { ...st, count: nSt },
      concreteVolume: vol,
      kgPerM3: steel.totalWeight / vol,
      steelPercent: steelPct,
      ...steel,
    };
  }

  // ---------------------------------------------------------------------------
  // Cost
  // ---------------------------------------------------------------------------
  /**
   * @param {object} q  quantities { cementBags, sandCft, aggCft, steelKg }
   * @param {object} r  rates { cement (per bag), sand (per cft), aggregate (per cft), steel (per kg) }
   */
  function cost(q, r) {
    const items = {
      cement: num(q.cementBags) * num(r.cement),
      sand: num(q.sandCft) * num(r.sand),
      aggregate: num(q.aggCft) * num(r.aggregate),
      steel: num(q.steelKg) * num(r.steel),
    };
    items.total = items.cement + items.sand + items.aggregate + items.steel;
    return items;
  }

  // ---------------------------------------------------------------------------
  // Unit conversion
  // ---------------------------------------------------------------------------
  const UNITS = {
    length: { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254, yd: 0.9144 },
    area: { 'm²': 1, 'ft²': 0.09290304, 'yd²': 0.83612736, acre: 4046.8564224, hectare: 10000, gunta: 101.17141056 },
    volume: { 'm³': 1, cft: 1 / CONST.CFT_PER_M3, litre: 0.001, 'yd³': 0.764554857984, brass: 100 / CONST.CFT_PER_M3 },
    weight: { kg: 1, tonne: 1000, quintal: 100, lb: 0.45359237, 'cement bag': CONST.BAG_WEIGHT },
  };

  function convert(value, from, to, kind) {
    const table = UNITS[kind];
    if (!table || !(from in table) || !(to in table)) throw new Error('Unknown unit');
    return (num(value) * table[from]) / table[to];
  }

  const api = {
    CONST,
    GRADES,
    STANDARD_DIAS,
    UNITS,
    unitWeight,
    barCount,
    concrete,
    slab,
    beam,
    column,
    rectStirrupLength,
    circularTieLength,
    cost,
    convert,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RCC = api;
})(typeof window !== 'undefined' ? window : globalThis);
