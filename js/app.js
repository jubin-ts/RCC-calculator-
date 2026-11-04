/* RCC Calculator – UI layer */
(function () {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  // ---------------------------------------------------------------- storage
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('rcc.' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('rcc.' + key, JSON.stringify(value));
      } catch (e) {
        /* storage unavailable – ignore */
      }
    },
  };

  // ---------------------------------------------------------------- formatting
  const fmt = (n, d = 2) =>
    Number.isFinite(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';
  const fmtInt = (n) => fmt(n, 0);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const toast = (msg) => {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  };

  // ---------------------------------------------------------------- theme
  const applyTheme = (t) => {
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  };
  applyTheme(store.get('theme', null));
  $('#themeToggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    store.set('theme', next);
  });

  // ---------------------------------------------------------------- navigation
  function showView(name) {
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    $$('.bottomnav button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    store.set('view', name);
    if (name === 'saved') renderSaved();
    window.scrollTo({ top: 0 });
  }
  $$('.bottomnav button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

  function showSteel(name) {
    $$('#steelTabs button').forEach((b) => b.classList.toggle('active', b.dataset.steel === name));
    $$('.steel-pane').forEach((p) => {
      const on = p.id === 'pane-' + name;
      p.classList.toggle('active', on);
      p.hidden = !on;
    });
    store.set('steelTab', name);
  }
  $$('#steelTabs button').forEach((b) => b.addEventListener('click', () => showSteel(b.dataset.steel)));

  // ---------------------------------------------------------------- selects
  $$('select[data-dias]').forEach((sel) => {
    const def = Number(sel.dataset.dias);
    sel.innerHTML = RCC.STANDARD_DIAS.map((d) => `<option value="${d}"${d === def ? ' selected' : ''}>${d} mm</option>`).join('');
  });
  $$('select[data-grades]').forEach((sel) => {
    const def = sel.dataset.grades;
    sel.innerHTML = Object.entries(RCC.GRADES)
      .map(([k, g]) => `<option value="${k}"${k === def ? ' selected' : ''}>${g.label}</option>`)
      .join('');
  });

  // ---------------------------------------------------------------- rates
  const DEFAULT_RATES = { currency: '₹', cement: '', sand: '', aggregate: '', steel: '' };
  let rates = Object.assign({}, DEFAULT_RATES, store.get('rates', {}));
  const hasRates = () => ['cement', 'sand', 'aggregate', 'steel'].some((k) => Number(rates[k]) > 0);
  const money = (n) => `${rates.currency || ''}\u00a0${fmt(n, 0)}`.trim();

  const ratesForm = $('#form-rates');
  Object.keys(DEFAULT_RATES).forEach((k) => {
    if (ratesForm.elements[k]) ratesForm.elements[k].value = rates[k];
  });
  ratesForm.addEventListener('input', () => {
    Object.keys(DEFAULT_RATES).forEach((k) => (rates[k] = ratesForm.elements[k].value));
    store.set('rates', rates);
    $('.saved-note', ratesForm).textContent = 'Rates saved ✓';
    clearTimeout(ratesForm._t);
    ratesForm._t = setTimeout(() => ($('.saved-note', ratesForm).textContent = ''), 1500);
    rerenderVisibleResults();
  });
  ratesForm.addEventListener('submit', (e) => e.preventDefault());

  // ---------------------------------------------------------------- form helpers
  function readForm(form) {
    const data = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name) return;
      if (el.type === 'radio') {
        if (el.checked) data[el.name] = el.value;
      } else if (el.type === 'checkbox') data[el.name] = el.checked;
      else data[el.name] = el.value;
    });
    return data;
  }
  function fillForm(form, data) {
    Array.from(form.elements).forEach((el) => {
      if (!el.name || !(el.name in data)) return;
      if (el.type === 'radio') el.checked = el.value === data[el.name];
      else if (el.type === 'checkbox') el.checked = !!data[el.name];
      else el.value = data[el.name];
    });
    form.dispatchEvent(new Event('change'));
  }
  function markInvalid(form) {
    let ok = true;
    $$('input[required]', form).forEach((el) => {
      if (el.offsetParent === null) return; // hidden
      const bad = !(parseFloat(el.value) > 0);
      el.classList.toggle('invalid', bad);
      if (bad) ok = false;
    });
    return ok;
  }

  // ---------------------------------------------------------------- render helpers
  const stat = (label, value, unit, sub, hl) =>
    `<div class="stat${hl ? ' highlight' : ''}"><div class="label">${label}</div><div class="value">${value}<span class="unit">${unit}</span></div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

  function concreteStats(c) {
    return `<div class="stats">
      ${stat('Cement', fmt(c.cement.bags, 2), 'bags', `${fmt(c.cement.kg, 0)} kg · order ${c.cement.bagsRounded} bags`, true)}
      ${stat('Fine aggregate (sand)', fmt(c.sand.cft, 2), 'cft', `${fmt(c.sand.m3, 3)} m³ · ≈ ${fmt(c.sand.tonnes, 2)} t`)}
      ${stat('Coarse aggregate', fmt(c.aggregate.cft, 2), 'cft', `${fmt(c.aggregate.m3, 3)} m³ · ≈ ${fmt(c.aggregate.tonnes, 2)} t`)}
      ${stat('Water', fmt(c.water.litres, 0), 'litres', `w/c ratio ${c.wc}`)}
    </div>`;
  }

  function steelTables(s) {
    const rows = s.rows
      .map(
        (r) => `<tr><td>${esc(r.name)}</td><td>${r.dia}</td><td>${r.count}</td><td>${fmt(r.cutLength, 3)}</td><td>${fmt(r.totalLength, 2)}</td><td>${fmt(r.weight, 2)}</td></tr>`
      )
      .join('');
    const byDia = s.byDia
      .map(
        (d) => `<tr><td>${d.dia} mm</td><td>${fmt(RCC.unitWeight(d.dia), 3)}</td><td>${fmt(d.length, 2)}</td><td>${d.bars12m}</td><td>${fmt(d.weight, 2)}</td></tr>`
      )
      .join('');
    return `
      <div class="section-title">Bar schedule</div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Member</th><th>Dia (mm)</th><th>Nos</th><th>Cut len (m)</th><th>Total (m)</th><th>Wt (kg)</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4">Total${s.wastage ? ` (before ${s.wastage}% wastage)` : ''}</td><td>${fmt(s.rows.reduce((a, r) => a + r.totalLength, 0), 2)}</td><td>${fmt(s.netWeight, 2)}</td></tr></tfoot>
      </table></div>
      <div class="section-title">Order by diameter${s.wastage ? ` (incl. ${s.wastage}% wastage)` : ''}</div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Dia</th><th>kg/m</th><th>Length (m)</th><th>12 m bars</th><th>Weight (kg)</th></tr></thead>
        <tbody>${byDia}</tbody>
      </table></div>`;
  }

  function costBlock(q) {
    if (!hasRates())
      return `<p class="note">To see the estimated cost, <button type="button" class="linkbtn" data-act="rates">add your material rates</button> on the Estimate tab.</p>`;
    const c = RCC.cost(q, rates);
    const parts = [];
    if (q.cementBags && Number(rates.cement)) parts.push(`Cement ${money(c.cement)}`);
    if (q.sandCft && Number(rates.sand)) parts.push(`Sand ${money(c.sand)}`);
    if (q.aggCft && Number(rates.aggregate)) parts.push(`Aggregate ${money(c.aggregate)}`);
    if (q.steelKg && Number(rates.steel)) parts.push(`Steel ${money(c.steel)}`);
    return `<div class="cost-line"><span>Estimated material cost</span><span>${money(c.total)}</span></div>
      <p class="hint small">${parts.join(' · ')}</p>`;
  }

  // ---------------------------------------------------------------- estimate state per calculator
  let saved = store.get('saved', []);
  const editing = {}; // kind -> id of the estimate item that was opened for editing
  const savedSig = {}; // kind -> signature of the inputs that were last saved
  const sig = (inputs) => JSON.stringify(inputs);

  function saveButtons(kind) {
    const item = last[kind];
    const editItem = editing[kind] && saved.find((x) => x.id === editing[kind]);
    const isSaved = item && savedSig[kind] === sig(item.inputs);
    const goto = `<button type="button" class="btn ghost small" data-act="goto-estimate">View estimate →</button>`;
    if (editItem) {
      const head = `<p class="note edit-note">Editing estimate item: <b>${esc(itemName(editItem))}</b></p>`;
      if (isSaved) return head + `<button type="button" class="btn primary small" disabled>✓ Saved in estimate</button>${goto}`;
      return (
        head +
        `<button type="button" class="btn primary small" data-act="save" data-kind="${kind}">Update estimate item</button>` +
        `<button type="button" class="btn ghost small" data-act="save-new" data-kind="${kind}">＋ Add as new item</button>`
      );
    }
    if (isSaved) return `<button type="button" class="btn primary small" disabled>✓ Added to estimate</button>${goto}`;
    return `<button type="button" class="btn primary small" data-act="save" data-kind="${kind}">＋ Add to estimate</button>`;
  }

  const actionsBlock = (kind) => `<div class="result-actions">
      ${saveButtons(kind)}
      <button type="button" class="btn ghost small" data-act="share" data-kind="${kind}">Share</button>
      <button type="button" class="btn ghost small" data-act="copy" data-kind="${kind}">Copy</button>
      <button type="button" class="btn ghost small" data-act="print">Print / PDF</button>
    </div>`;

  // ---------------------------------------------------------------- state of last results
  const last = {}; // kind -> { inputs, result, concrete, text, totals, title }

  // ---------------------------------------------------------------- CONCRETE
  const fC = $('#form-concrete');

  function concreteVolumeFromForm(d) {
    if (d.volMode === 'dims') {
      const v = (parseFloat(d.dl) || 0) * (parseFloat(d.dw) || 0) * (parseFloat(d.dd) || 0) * (Math.max(1, parseInt(d.dq, 10) || 1));
      return v;
    }
    return parseFloat(d.volume) || 0;
  }

  function syncConcreteForm() {
    const d = readForm(fC);
    $('.custom-ratio', fC).hidden = d.grade !== 'CUSTOM';
    $('.vol-direct', fC).hidden = d.volMode === 'dims';
    $('.vol-dims', fC).hidden = d.volMode !== 'dims';
    const v = concreteVolumeFromForm({ ...d, volMode: 'dims' });
    $('[data-out="dimVol"]', fC).textContent = v > 0 ? `Volume = ${fmt(v, 3)} m³ (${fmt(v * RCC.CONST.CFT_PER_M3, 2)} cft)` : '';
    const wc = fC.elements.wc;
    const g = RCC.GRADES[d.grade];
    wc.placeholder = g ? `auto (${g.wc})` : 'auto (0.5)';
  }

  function calcConcrete(silent) {
    const d = readForm(fC);
    const volume = concreteVolumeFromForm(d);
    const out = $('#result-concrete');
    if (d.volMode === 'dims') {
      ['dl', 'dw', 'dd'].forEach((n) => fC.elements[n].classList.toggle('invalid', !(parseFloat(fC.elements[n].value) > 0)));
    } else fC.elements.volume.classList.toggle('invalid', !(volume > 0));
    if (!(volume > 0)) {
      if (!silent) out.innerHTML = `<div class="card"><p class="error">Enter the volume of concrete (m³) or its dimensions.</p></div>`;
      return;
    }
    try {
      const params = { volume, grade: d.grade, wastage: d.wastage, dryFactor: d.dryFactor };
      if (d.wc !== '') params.wc = d.wc;
      if (d.grade === 'CUSTOM') params.ratio = [d.rc, d.rs, d.ra];
      const r = RCC.concrete(params);
      const ratioTxt = r.ratio.join(' : ');
      const gradeTxt = d.grade === 'CUSTOM' ? `Custom (${ratioTxt})` : `${d.grade} (${ratioTxt})`;
      const totals = { volume: r.wetVolume, cementBags: r.cement.bags, sandCft: r.sand.cft, aggCft: r.aggregate.cft, waterL: r.water.litres, steelKg: 0, steelByDia: {} };
      last.concrete = {
        inputs: d,
        title: `${gradeTxt} – ${fmt(r.wetVolume, 2)} m³`,
        totals,
        text: [
          `RCC Calculator – Concrete ${gradeTxt}`,
          `Volume: ${fmt(r.wetVolume, 3)} m³${r.wastage ? ` (+${r.wastage}% wastage)` : ''}`,
          `Cement: ${fmt(r.cement.bags, 2)} bags (${fmt(r.cement.kg, 0)} kg)`,
          `Fine aggregate (sand): ${fmt(r.sand.cft, 2)} cft`,
          `Coarse aggregate: ${fmt(r.aggregate.cft, 2)} cft`,
          `Water: ${fmt(r.water.litres, 0)} litres`,
        ].join('\n'),
      };
      out.innerHTML = `<div class="card">
        <div class="result-head"><h3>Materials required</h3><span class="meta">${esc(gradeTxt)} · ${fmt(r.wetVolume, 3)} m³${r.wastage ? ` + ${r.wastage}% wastage` : ''}</span></div>
        ${concreteStats(r)}
        <p class="hint small">Dry volume = ${fmt(r.volume, 3)} × ${r.dryFactor} = ${fmt(r.dryVolume, 3)} m³</p>
        ${costBlock(totals)}
        ${actionsBlock('concrete')}
      </div>`;
    } catch (e) {
      out.innerHTML = `<div class="card"><p class="error">${esc(e.message)}</p></div>`;
    }
  }

  fC.addEventListener('change', syncConcreteForm);
  fC.addEventListener('input', () => {
    syncConcreteForm();
    if (last.concrete) calcConcrete(true);
  });
  fC.addEventListener('submit', (e) => {
    e.preventDefault();
    calcConcrete(false);
    $('#result-concrete').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  fC.addEventListener('reset', () =>
    setTimeout(() => {
      $('#result-concrete').innerHTML = '';
      delete last.concrete;
      delete editing.concrete;
      delete savedSig.concrete;
      $$('.invalid', fC).forEach((el) => el.classList.remove('invalid'));
      syncConcreteForm();
    })
  );

  // ---------------------------------------------------------------- STEEL (slab / beam / column)
  const steelDefs = {
    slab: {
      form: $('#form-slab'),
      calc: (d) => RCC.slab(d),
      title: (d, r) => `${r.type === 'two' ? 'Two' : 'One'}-way slab ${d.length} × ${d.width} × ${d.thickness} m`,
      summary: (d, r) => [
        `Shorter span ${fmt(r.shorterSpan, 2)} m, longer span ${fmt(r.longerSpan, 2)} m`,
        `Main bars ${d.diaShort} mm @ ${d.spacingShort} m, ${r.type === 'two' ? 'longer-span main' : 'distribution'} bars ${d.diaLong} mm @ ${d.spacingLong || d.spacingShort} m`,
      ],
      notes: (d, r) => {
        const n = [];
        const ratio = r.longerSpan / r.shorterSpan;
        if (r.type === 'one' && ratio < 2) n.push(['warn', `Ly/Lx = ${fmt(ratio, 2)} (< 2): this slab normally behaves as a <b>two-way</b> slab.`]);
        if (r.type === 'two' && ratio >= 2) n.push(['warn', `Ly/Lx = ${fmt(ratio, 2)} (≥ 2): this slab normally behaves as a <b>one-way</b> slab.`]);
        const t = parseFloat(d.thickness);
        if (parseFloat(d.spacingShort) > Math.min(3 * t, 0.3) + 1e-9) n.push(['warn', `Main bar spacing exceeds IS 456 limit of 3d or 300 mm (${fmt(Math.min(3 * t, 0.3), 2)} m).`]);
        return n;
      },
    },
    beam: {
      form: $('#form-beam'),
      calc: (d) => RCC.beam(d),
      title: (d, r) => `Beam ${d.length} m (${d.width} × ${d.depth})${r.qty > 1 ? ` × ${r.qty}` : ''}`,
      summary: (d, r) => [
        `Top ${d.topCount} – ${d.topDia} mm, bottom ${d.bottomCount} – ${d.bottomDia} mm`,
        `Stirrups ${d.stirrupDia} mm @ ${d.stirrupSpacing} m: ${r.stirrup.count} nos × ${fmt(r.stirrup.length, 3)} m${r.qty > 1 ? ` per beam` : ''}`,
      ],
      notes: (d, r) => {
        const n = [];
        const D = parseFloat(d.depth);
        const c = parseFloat(d.cover || 2.5) / 100;
        const dEff = D - c - parseFloat(d.stirrupDia) / 1000 - parseFloat(d.bottomDia) / 2000;
        const maxSp = Math.min(0.75 * dEff, 0.3);
        if (parseFloat(d.stirrupSpacing) > maxSp + 1e-9) n.push(['warn', `Stirrup spacing exceeds IS 456 limit of 0.75d or 300 mm (${fmt(maxSp, 3)} m).`]);
        n.push(['', `Stirrup size (centre-line): ${fmt(r.stirrup.a * 1000, 0)} × ${fmt(r.stirrup.b * 1000, 0)} mm, cutting length ${fmt(r.stirrup.length, 3)} m.`]);
        return n;
      },
    },
    column: {
      form: $('#form-column'),
      calc: (d) => RCC.column(d),
      title: (d, r) =>
        `${r.shape === 'circle' ? `Circular column Ø${d.width}` : `Column ${d.width} × ${d.depth}`} × ${d.height} m${r.qty > 1 ? ` × ${r.qty}` : ''}`,
      summary: (d, r) => [
        `${d.barCount} bars of ${d.barDia} mm, ties ${d.stirrupDia} mm @ ${d.stirrupSpacing} m`,
        `Ties: ${r.stirrup.count} nos × ${fmt(r.stirrup.length, 3)} m${r.qty > 1 ? ' per column' : ''}`,
      ],
      notes: (d, r) => {
        const n = [];
        const p = r.steelPercent;
        if (p < 0.8) n.push(['warn', `Longitudinal steel = ${fmt(p, 2)} % — below IS 456 minimum of 0.8 %.`]);
        else if (p > 4) n.push(['warn', `Longitudinal steel = ${fmt(p, 2)} % — above IS 456 practical maximum of 4 %.`]);
        else n.push(['ok', `Longitudinal steel = ${fmt(p, 2)} % (within IS 456 range 0.8 – 4 %).`]);
        if (r.shape === 'rect' && parseInt(d.barCount, 10) < 4) n.push(['warn', 'A rectangular column needs at least 4 longitudinal bars.']);
        if (r.shape === 'circle' && parseInt(d.barCount, 10) < 6) n.push(['warn', 'A circular column needs at least 6 longitudinal bars.']);
        const minDim = r.shape === 'circle' ? parseFloat(d.width) : Math.min(parseFloat(d.width), parseFloat(d.depth));
        const maxSp = Math.min(minDim, (16 * parseFloat(d.barDia)) / 1000, 0.3);
        if (parseFloat(d.stirrupSpacing) > maxSp + 1e-9) n.push(['warn', `Tie spacing exceeds IS 456 limit (least of b, 16Ø, 300 mm = ${fmt(maxSp, 3)} m).`]);
        if (parseFloat(d.stirrupDia) < Math.max(6, parseFloat(d.barDia) / 4)) n.push(['warn', `Tie diameter should be at least ¼ of main bar dia and not less than 6 mm.`]);
        return n;
      },
    },
  };

  function calcSteel(kind, silent) {
    const def = steelDefs[kind];
    const out = $('#result-' + kind);
    const ok = markInvalid(def.form);
    if (!ok) {
      if (!silent) out.innerHTML = `<div class="card"><p class="error">Fill in the highlighted fields.</p></div>`;
      return;
    }
    const d = readForm(def.form);
    try {
      const r = def.calc(d);
      const conc = RCC.concrete({ volume: r.concreteVolume, grade: d.grade });
      const byDiaKg = {};
      r.byDia.forEach((x) => (byDiaKg[x.dia] = x.weight));
      const totals = {
        volume: r.concreteVolume,
        cementBags: conc.cement.bags,
        sandCft: conc.sand.cft,
        aggCft: conc.aggregate.cft,
        waterL: conc.water.litres,
        steelKg: r.totalWeight,
        steelByDia: byDiaKg,
      };
      const title = def.title(d, r);
      const notes = def
        .notes(d, r)
        .map(([cls, html]) => `<p class="note ${cls}">${html}</p>`)
        .join('');

      last[kind] = {
        inputs: d,
        title,
        totals,
        text: [
          `RCC Calculator – ${title}`,
          ...def.summary(d, r),
          `Total steel: ${fmt(r.totalWeight, 2)} kg (${fmt(r.tonnes, 3)} t)`,
          ...r.byDia.map((x) => `  ${x.dia} mm: ${fmt(x.weight, 2)} kg – ${x.bars12m} bars of 12 m`),
          `Concrete ${d.grade}: ${fmt(r.concreteVolume, 3)} m³ → cement ${fmt(conc.cement.bags, 2)} bags, sand ${fmt(conc.sand.cft, 2)} cft, aggregate ${fmt(conc.aggregate.cft, 2)} cft, water ${fmt(conc.water.litres, 0)} L`,
        ].join('\n'),
      };

      out.innerHTML = `<div class="card">
        <div class="result-head"><h3>TMT steel required</h3><span class="meta">${esc(title)}</span></div>
        <div class="stats">
          ${stat('Total steel', fmt(r.totalWeight, 2), 'kg', `${fmt(r.tonnes, 3)} tonnes${r.wastage ? ` · incl. ${r.wastage}% wastage` : ''}`, true)}
          ${stat('Total length', fmt(r.totalLength, 1), 'm', `${r.byDia.reduce((a, x) => a + x.bars12m, 0)} bars of 12 m`)}
          ${stat('Concrete', fmt(r.concreteVolume, 3), 'm³', `${fmt(r.concreteVolume * RCC.CONST.CFT_PER_M3, 1)} cft`)}
          ${stat('Steel density', fmt(r.kgPerM3, 1), 'kg/m³', 'of concrete')}
        </div>
        ${notes}
        ${steelTables(r)}
        <div class="section-title">Concrete for this member – ${esc(RCC.GRADES[d.grade].label)}</div>
        ${concreteStats(conc)}
        ${costBlock(totals)}
        ${actionsBlock(kind)}
      </div>`;
    } catch (e) {
      out.innerHTML = `<div class="card"><p class="error">${esc(e.message)}</p></div>`;
    }
  }

  Object.entries(steelDefs).forEach(([kind, def]) => {
    const f = def.form;
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      calcSteel(kind, false);
      $('#result-' + kind).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    f.addEventListener('input', () => {
      if (last[kind]) calcSteel(kind, true);
    });
    f.addEventListener('reset', () =>
      setTimeout(() => {
        $('#result-' + kind).innerHTML = '';
        delete last[kind];
        delete editing[kind];
        delete savedSig[kind];
        $$('.invalid', f).forEach((el) => el.classList.remove('invalid'));
        f.dispatchEvent(new Event('change'));
      })
    );
  });

  // slab type hint
  const fS = $('#form-slab');
  const syncSlab = () => {
    const two = readForm(fS).type === 'two';
    $('[data-out="slabTypeHint"]', fS).textContent = two
      ? 'Two way: main bars in both directions (Ly/Lx < 2).'
      : 'One way: main bars along the shorter span, distribution bars along the longer span (Ly/Lx ≥ 2).';
  };
  fS.addEventListener('change', syncSlab);
  syncSlab();

  // column shape
  const fCol = $('#form-column');
  const syncCol = () => {
    const circle = readForm(fCol).shape === 'circle';
    $('.rect-only', fCol).hidden = circle;
    fCol.elements.depth.required = !circle;
    $('[data-shape-label]', fCol).textContent = circle ? 'Diameter' : 'Width';
  };
  fCol.addEventListener('change', () => {
    syncCol();
    if (last.column) calcSteel('column', true);
  });
  syncCol();

  function rerenderVisibleResults() {
    if (last.concrete) calcConcrete(true);
    Object.keys(steelDefs).forEach((k) => last[k] && calcSteel(k, true));
    if ($('#view-saved').classList.contains('active')) renderSaved();
  }

  // ---------------------------------------------------------------- result actions
  async function shareText(text, title) {
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    copyText(text);
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        toast('Copied to clipboard');
      } catch (e2) {
        toast('Could not copy');
      }
      ta.remove();
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const kind = btn.dataset.kind;
    const item = last[kind];
    if (act === 'print') return window.print();
    if (act === 'goto-estimate') return showView('saved');
    if (act === 'rates') {
      showView('saved');
      const box = $('#ratesBox');
      box.open = true;
      setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      return;
    }
    if (!item) return;
    if (act === 'save') saveItem(kind, item, false);
    if (act === 'save-new') saveItem(kind, item, true);
    if (act === 'share') shareText(item.text, 'RCC Calculator');
    if (act === 'copy') copyText(item.text);
  });

  // ---------------------------------------------------------------- saved / estimate
  const projectName = $('#projectName');
  projectName.value = store.get('project', '');
  projectName.addEventListener('input', () => store.set('project', projectName.value));

  const KIND_LABEL = { concrete: 'Concrete', slab: 'Slab', beam: 'Beam', column: 'Column' };

  function updateBadge() {
    const b = $('#savedBadge');
    b.textContent = saved.length;
    b.hidden = saved.length === 0;
  }

  const itemName = (s) => s.name || s.title;

  function saveItem(kind, item, asNew) {
    const data = { kind, title: item.title, date: new Date().toISOString(), inputs: item.inputs, totals: item.totals, text: item.text };
    const idx = !asNew && editing[kind] ? saved.findIndex((x) => x.id === editing[kind]) : -1;
    if (idx >= 0) {
      saved[idx] = Object.assign({}, saved[idx], data);
      toast('Estimate item updated');
    } else {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      saved.push(Object.assign({ id }, data));
      if (asNew) editing[kind] = id;
      toast(`Added to estimate (${saved.length} item${saved.length > 1 ? 's' : ''})`);
    }
    store.set('saved', saved);
    savedSig[kind] = sig(item.inputs);
    updateBadge();
    refreshResult(kind);
  }

  function refreshResult(kind) {
    if (!last[kind]) return;
    if (kind === 'concrete') calcConcrete(true);
    else calcSteel(kind, true);
  }

  function aggregate(items) {
    const t = { volume: 0, cementBags: 0, sandCft: 0, aggCft: 0, waterL: 0, steelKg: 0, steelByDia: {} };
    items.forEach((i) => {
      ['volume', 'cementBags', 'sandCft', 'aggCft', 'waterL', 'steelKg'].forEach((k) => (t[k] += i.totals[k] || 0));
      Object.entries(i.totals.steelByDia || {}).forEach(([d, kg]) => (t.steelByDia[d] = (t.steelByDia[d] || 0) + kg));
    });
    return t;
  }

  function estimateText(t) {
    const lines = [`RCC Calculator – Project estimate${projectName.value ? `: ${projectName.value}` : ''}`, ''];
    saved.forEach((s, i) => lines.push(`${i + 1}. [${KIND_LABEL[s.kind]}] ${itemName(s)}${s.name ? ` – ${s.title}` : ''}`));
    lines.push(
      '',
      `Concrete: ${fmt(t.volume, 3)} m³`,
      `Cement: ${fmt(t.cementBags, 2)} bags (order ${Math.ceil(t.cementBags - 1e-9)})`,
      `Sand: ${fmt(t.sandCft, 2)} cft`,
      `Aggregate: ${fmt(t.aggCft, 2)} cft`,
      `Water: ${fmt(t.waterL, 0)} litres`,
      `TMT steel: ${fmt(t.steelKg, 2)} kg (${fmt(t.steelKg / 1000, 3)} t)`
    );
    Object.keys(t.steelByDia)
      .sort((a, b) => a - b)
      .forEach((d) => lines.push(`  ${d} mm: ${fmt(t.steelByDia[d], 2)} kg`));
    if (hasRates()) lines.push('', `Estimated material cost: ${money(RCC.cost(t, rates).total)}`);
    return lines.join('\n');
  }

  function renderSaved() {
    const list = $('#savedList');
    const sum = $('#estimateSummary');
    updateBadge();
    if (!saved.length) {
      sum.innerHTML = '';
      list.innerHTML = `<div class="card empty">No saved calculations yet.<br />Run a calculation and tap <b>＋ Add to estimate</b>.</div>`;
      return;
    }
    const t = aggregate(saved);
    const dias = Object.keys(t.steelByDia).sort((a, b) => a - b);
    const showCost = hasRates();
    const itemRows = saved
      .map((s, i) => {
        const x = s.totals;
        return `<tr><td>${i + 1}. ${esc(itemName(s))}<br /><small class="muted">${KIND_LABEL[s.kind]}${s.name ? ` · ${esc(s.title)}` : ''}</small></td>
          <td>${fmt(x.volume, 3)}</td><td>${fmt(x.cementBags, 2)}</td><td>${fmt(x.sandCft, 2)}</td><td>${fmt(x.aggCft, 2)}</td><td>${fmt(x.waterL, 0)}</td><td>${fmt(x.steelKg || 0, 2)}</td>
          ${showCost ? `<td>${money(RCC.cost(x, rates).total)}</td>` : ''}</tr>`;
      })
      .join('');
    sum.innerHTML = `<div class="card">
      <div class="print-only print-head"><h3>${esc(projectName.value || 'Project estimate')}</h3><p>Bill of materials · ${new Date().toLocaleDateString()}</p></div>
      <div class="result-head"><h3>Bill of materials</h3><span class="meta">${saved.length} item${saved.length > 1 ? 's' : ''}</span></div>
      <div class="stats">
        ${stat('Cement', fmt(t.cementBags, 2), 'bags', `order ${Math.ceil(t.cementBags - 1e-9)} bags`, true)}
        ${stat('Sand', fmt(t.sandCft, 2), 'cft', `${fmt(t.sandCft / 100, 2)} brass`)}
        ${stat('Aggregate', fmt(t.aggCft, 2), 'cft', `${fmt(t.aggCft / 100, 2)} brass`)}
        ${stat('Water', fmt(t.waterL, 0), 'litres', '')}
        ${stat('Concrete', fmt(t.volume, 3), 'm³', '')}
        ${stat('TMT steel', fmt(t.steelKg, 1), 'kg', `${fmt(t.steelKg / 1000, 3)} t`, true)}
      </div>
      ${dias.length ? `<div class="section-title">Steel by diameter</div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Dia</th><th>Weight (kg)</th><th>≈ 12 m bars</th></tr></thead><tbody>
      ${dias.map((d) => `<tr><td>${d} mm</td><td>${fmt(t.steelByDia[d], 2)}</td><td>${Math.ceil(t.steelByDia[d] / (RCC.unitWeight(+d) * 12) - 1e-9)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      ${costBlock(t)}
      <div class="section-title">Item-wise breakdown</div>
      <div class="table-wrap"><table class="table items-table">
        <thead><tr><th>Item</th><th>Concrete (m³)</th><th>Cement (bags)</th><th>Sand (cft)</th><th>Agg. (cft)</th><th>Water (L)</th><th>Steel (kg)</th>${showCost ? '<th>Cost</th>' : ''}</tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot><tr><td>Total</td><td>${fmt(t.volume, 3)}</td><td>${fmt(t.cementBags, 2)}</td><td>${fmt(t.sandCft, 2)}</td><td>${fmt(t.aggCft, 2)}</td><td>${fmt(t.waterL, 0)}</td><td>${fmt(t.steelKg, 2)}</td>${showCost ? `<td>${money(RCC.cost(t, rates).total)}</td>` : ''}</tr></tfoot>
      </table></div>
      <div class="result-actions">
        <button type="button" class="btn ghost small" id="estShare">Share</button>
        <button type="button" class="btn ghost small" id="estCsv">Export CSV</button>
        <button type="button" class="btn ghost small" data-act="print">Print / PDF</button>
        <button type="button" class="btn danger small" id="estClear">Clear all</button>
      </div>
    </div>`;
    list.innerHTML = saved
      .map(
        (s) => `<div class="card saved-item" data-id="${s.id}">
        <div><h4><span class="tag">${KIND_LABEL[s.kind]}</span>${esc(itemName(s))}</h4>
        <p>${s.name ? `${esc(s.title)} · ` : ''}cement ${fmt(s.totals.cementBags, 1)} bags${s.totals.steelKg ? ` · steel ${fmt(s.totals.steelKg, 1)} kg` : ''}</p>
        <p>${new Date(s.date).toLocaleString()}</p></div>
        <div class="btns"><button type="button" class="btn ghost small" data-open="${s.id}">Open / edit</button>
        <button type="button" class="btn ghost small" data-rename="${s.id}" aria-label="Rename" title="Rename">✎</button>
        <button type="button" class="btn danger small" data-del="${s.id}" aria-label="Delete" title="Delete">✕</button></div>
      </div>`
      )
      .join('');

    $('#estShare').onclick = () => shareText(estimateText(t), 'Project estimate');
    $('#estCsv').onclick = () => downloadCsv(t);
    $('#estClear').onclick = () => {
      if (confirm('Remove all items from this estimate?')) {
        saved = [];
        store.set('saved', saved);
        Object.keys(editing).forEach((k) => delete editing[k]);
        Object.keys(savedSig).forEach((k) => delete savedSig[k]);
        renderSaved();
        rerenderVisibleResults();
      }
    };
  }

  $('#savedList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    const open = e.target.closest('[data-open]');
    const ren = e.target.closest('[data-rename]');
    if (del) {
      const s = saved.find((x) => x.id === del.dataset.del);
      if (!s || !confirm(`Remove "${itemName(s)}" from the estimate?`)) return;
      saved = saved.filter((x) => x.id !== s.id);
      store.set('saved', saved);
      if (editing[s.kind] === s.id) {
        delete editing[s.kind];
        delete savedSig[s.kind];
      }
      renderSaved();
      rerenderVisibleResults();
      toast('Item removed');
    } else if (ren) {
      const s = saved.find((x) => x.id === ren.dataset.rename);
      if (!s) return;
      const name = prompt('Name for this item (e.g. "Ground floor slab")', itemName(s));
      if (name === null) return;
      s.name = name.trim() && name.trim() !== s.title ? name.trim() : '';
      store.set('saved', saved);
      renderSaved();
      rerenderVisibleResults();
    } else if (open) {
      const s = saved.find((x) => x.id === open.dataset.open);
      if (!s) return;
      editing[s.kind] = s.id;
      savedSig[s.kind] = sig(s.inputs);
      if (s.kind === 'concrete') {
        fillForm(fC, s.inputs);
        syncConcreteForm();
        showView('concrete');
        calcConcrete(false);
      } else {
        fillForm(steelDefs[s.kind].form, s.inputs);
        showView('steel');
        showSteel(s.kind);
        calcSteel(s.kind, false);
      }
      // the form may normalise values, so remember what is actually shown
      if (last[s.kind]) {
        savedSig[s.kind] = sig(last[s.kind].inputs);
        refreshResult(s.kind);
      }
    }
  });

  function downloadCsv(t) {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['#', 'Type', 'Description', 'Concrete (m3)', 'Cement (bags)', 'Sand (cft)', 'Aggregate (cft)', 'Water (L)', 'Steel (kg)']];
    saved.forEach((s, i) =>
      rows.push([i + 1, KIND_LABEL[s.kind], s.name ? `${s.name} (${s.title})` : s.title, s.totals.volume.toFixed(3), s.totals.cementBags.toFixed(2), s.totals.sandCft.toFixed(2), s.totals.aggCft.toFixed(2), s.totals.waterL.toFixed(0), (s.totals.steelKg || 0).toFixed(2)])
    );
    rows.push(['', '', 'TOTAL', t.volume.toFixed(3), t.cementBags.toFixed(2), t.sandCft.toFixed(2), t.aggCft.toFixed(2), t.waterL.toFixed(0), t.steelKg.toFixed(2)]);
    rows.push([]);
    Object.keys(t.steelByDia)
      .sort((a, b) => a - b)
      .forEach((d) => rows.push(['', 'Steel', `${d} mm`, '', '', '', '', '', t.steelByDia[d].toFixed(2)]));
    const csv = rows.map((r) => r.map(q).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (projectName.value || 'rcc-estimate').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  // ---------------------------------------------------------------- tools: converter
  const fConv = $('#form-convert');
  const KIND_NAMES = { length: 'Length', area: 'Area', volume: 'Volume', weight: 'Weight' };
  fConv.elements.kind.innerHTML = Object.keys(RCC.UNITS).map((k) => `<option value="${k}">${KIND_NAMES[k]}</option>`).join('');
  fConv.elements.kind.value = 'volume';
  const fillUnits = () => {
    const units = Object.keys(RCC.UNITS[fConv.elements.kind.value]);
    const opts = units.map((u) => `<option>${u}</option>`).join('');
    fConv.elements.from.innerHTML = opts;
    fConv.elements.to.innerHTML = opts;
    fConv.elements.to.value = units[1];
  };
  const doConvert = () => {
    const { kind, value, from, to } = readForm(fConv);
    const r = RCC.convert(value, from, to, kind);
    $('.convert-out', fConv).textContent = `${fmt(parseFloat(value) || 0, 3)} ${from} = ${r.toLocaleString('en-IN', { maximumFractionDigits: 4 })} ${to}`;
  };
  fConv.elements.kind.addEventListener('change', fillUnits);
  fConv.addEventListener('input', doConvert);
  fConv.addEventListener('change', doConvert);
  fConv.addEventListener('submit', (e) => e.preventDefault());
  fillUnits();
  doConvert();

  // weight table
  $('#weightTable').innerHTML =
    '<thead><tr><th>Dia</th><th>kg / m</th><th>kg / 12 m bar</th><th>Bars / tonne</th></tr></thead><tbody>' +
    RCC.STANDARD_DIAS.map((d) => {
      const w = RCC.unitWeight(d);
      return `<tr><td>${d} mm</td><td>${fmt(w, 3)}</td><td>${fmt(w * 12, 2)}</td><td>${fmt(1000 / (w * 12), 1)}</td></tr>`;
    }).join('') +
    '</tbody>';

  // mix table (per m³)
  $('#mixTable').innerHTML =
    '<thead><tr><th>Grade</th><th>Ratio</th><th>Cement (bags/m³)</th><th>Sand (cft/m³)</th><th>Agg. (cft/m³)</th><th>Water (L/m³)</th></tr></thead><tbody>' +
    Object.entries(RCC.GRADES)
      .map(([g, v]) => {
        const r = RCC.concrete({ volume: 1, grade: g });
        return `<tr><td>${g}</td><td>${v.ratio.join(':')}</td><td>${fmt(r.cement.bags, 2)}</td><td>${fmt(r.sand.cft, 2)}</td><td>${fmt(r.aggregate.cft, 2)}</td><td>${fmt(r.water.litres, 0)}</td></tr>`;
      })
      .join('') +
    '</tbody>';

  // ---------------------------------------------------------------- init
  syncConcreteForm();
  updateBadge();
  showSteel(store.get('steelTab', 'slab'));
  showView(store.get('view', 'concrete'));

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
