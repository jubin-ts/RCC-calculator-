/* RCC Calculator – Projects tab: item-wise estimate (bill of quantities) for many projects */
(function () {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

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

  const fmt = (n, d = 2) =>
    Number.isFinite(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cur = () => (store.get('rates', {}).currency ?? '₹') || '';
  const money = (n) => `${cur()} ${fmt(n, 2)}`.trim();
  const toast = (msg) => {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  };

  // ---------------------------------------------------------------- state
  let projects = [];
  try {
    projects = (store.get('boq.projects', []) || []).map(BOQ.normalizeProject);
  } catch (e) {
    projects = [];
  }
  if (!projects.length) projects = [BOQ.newProject('My first project')];
  let currentId = store.get('boq.current', projects[0].id);
  const company = Object.assign({ name: '', address: '', engineer: '' }, store.get('boq.company', {}));

  const project = () => projects.find((p) => p.id === currentId) || projects[0];
  const save = () => {
    store.set('boq.projects', projects);
    store.set('boq.current', project().id);
  };
  const findItem = (id) => project().items.find((i) => i.id === id);

  // ---------------------------------------------------------------- project bar
  const sel = $('#boqSelect');
  function renderSelect() {
    sel.innerHTML = projects.map((p) => `<option value="${p.id}"${p.id === project().id ? ' selected' : ''}>${esc(p.name || 'Untitled')}</option>`).join('');
  }
  sel.addEventListener('change', () => {
    currentId = sel.value;
    save();
    renderAll();
  });

  function addProject(p, msg) {
    projects.push(p);
    currentId = p.id;
    save();
    renderAll();
    toast(msg);
  }

  $('#boqBar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-boq]');
    if (!b) return;
    const act = b.dataset.boq;
    if (act === 'new') {
      const name = prompt('Name of the new project', `Project ${projects.length + 1}`);
      if (name === null) return;
      addProject(BOQ.newProject(name.trim() || `Project ${projects.length + 1}`), 'New project created');
    } else if (act === 'dup') {
      addProject(BOQ.cloneProject(project()), 'Project duplicated');
    } else if (act === 'sample') {
      addProject(BOQ.sampleProject(), 'Sample project added');
    } else if (act === 'delete') {
      if (!confirm(`Delete the project "${project().name}" and all its items?`)) return;
      projects = projects.filter((p) => p.id !== project().id);
      if (!projects.length) projects = [BOQ.newProject('My first project')];
      currentId = projects[0].id;
      save();
      renderAll();
      toast('Project deleted');
    } else if (act === 'export') {
      download(JSON.stringify(project(), null, 1), fileName('json'), 'application/json');
    } else if (act === 'import') {
      $('#boqFile').click();
    }
  });

  $('#boqFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const p = BOQ.normalizeProject(JSON.parse(await f.text()));
      if (projects.some((x) => x.id === p.id)) p.id = BOQ.uid();
      addProject(p, `Imported "${p.name}"`);
    } catch (err) {
      alert('Could not import this file: ' + err.message);
    }
  });

  // ---------------------------------------------------------------- details
  const fD = $('#boqDetails');
  const DETAIL_FIELDS = ['name', 'client', 'place', 'workType', 'date', 'estNo', 'title', 'taxPct'];
  const COMPANY_FIELDS = ['name', 'address', 'engineer'];
  function fillDetails() {
    const p = project();
    DETAIL_FIELDS.forEach((k) => (fD.elements['p_' + k].value = p[k] ?? ''));
    COMPANY_FIELDS.forEach((k) => (fD.elements['c_' + k].value = company[k] ?? ''));
  }
  fD.addEventListener('input', (e) => {
    const n = e.target.name || '';
    if (n.startsWith('p_')) {
      project()[n.slice(2)] = e.target.value;
      if (n === 'p_name') renderSelect();
      save();
    } else if (n.startsWith('c_')) {
      company[n.slice(2)] = e.target.value;
      store.set('boq.company', company);
    }
    renderSummary();
  });
  fD.addEventListener('submit', (e) => e.preventDefault());

  // ---------------------------------------------------------------- items editor
  const box = $('#boqItems');
  const unitOptions = (u) => BOQ.UNITS.map((x) => `<option${x === u ? ' selected' : ''}>${x}</option>`).join('');
  const qtyText = (q) => fmt(q, 2);

  function rowHtml(r) {
    const auto = BOQ.rowQty(Object.assign({}, r, { qty: '' }));
    const numIn = (f, ph) =>
      `<label><span>${ph}</span><input type="number" step="any" inputmode="decimal" data-r="${f}" value="${esc(r[f])}" /></label>`;
    return `<div class="boq-row${r.ded ? ' ded' : ''}" data-row="${r.id}">
      <label class="desc"><span>${r.ded ? 'Deduction' : 'Description'}</span><input type="text" data-r="desc" value="${esc(r.desc)}" placeholder="${r.ded ? 'e.g. Door D1' : 'e.g. Wall, Slab S1'}" /></label>
      ${numIn('nos', 'Nos')}${numIn('l', 'L (m)')}${numIn('w', 'W (m)')}${numIn('h', 'H/D (m)')}
      <label><span>Qty</span><input type="number" step="any" inputmode="decimal" data-r="qty" value="${esc(r.qty)}" placeholder="${qtyText(auto)}" title="Calculated from the dimensions. Type a value to enter the quantity directly." /></label>
      <div class="row-btns">
        <button type="button" class="btn ghost small" data-rowact="ded" title="${r.ded ? 'Make it a normal row' : 'Make it a deduction'}" aria-label="Toggle deduction">${r.ded ? '＋' : '−'}</button>
        <button type="button" class="btn danger small" data-rowact="del" title="Delete row" aria-label="Delete row">✕</button>
      </div>
    </div>`;
  }

  function footHtml(it, t) {
    if (it.unit === 'LS') return `<b>Lump sum</b> = <b>${money(t.amount)}</b>`;
    const ded = t.deduction ? ` − deductions ${qtyText(t.deduction)} = <b>${qtyText(t.qty)}</b>` : '';
    return `Quantity ${qtyText(t.gross)}${ded} ${esc(it.unit)} × ${money(t.rate)} = <b>${money(t.amount)}</b>`;
  }

  function itemHtml(it, sl) {
    const tools = `<div class="item-tools">
        <button type="button" class="btn ghost small" data-itemact="up" title="Move up" aria-label="Move up">↑</button>
        <button type="button" class="btn ghost small" data-itemact="down" title="Move down" aria-label="Move down">↓</button>
        ${it.kind === 'heading' ? '' : '<button type="button" class="btn ghost small" data-itemact="copy" title="Duplicate item">Duplicate</button>'}
        <button type="button" class="btn danger small" data-itemact="del" title="Delete" aria-label="Delete">✕</button>
      </div>`;
    if (it.kind === 'heading')
      return `<div class="card boq-item heading" data-item="${it.id}">
        <label><span>Section heading</span><input type="text" data-f="desc" value="${esc(it.desc)}" placeholder="e.g. Ground floor" /></label>${tools}</div>`;
    const t = BOQ.itemTotals(it);
    const ls = it.unit === 'LS';
    return `<div class="card boq-item" data-item="${it.id}">
      <div class="item-head"><span class="sl">${sl}</span>
        <label class="grow"><span>Particular / description of work</span><textarea rows="2" data-f="desc" placeholder="e.g. Earth work excavation for foundation">${esc(it.desc)}</textarea></label>
      </div>
      <div class="grid2">
        <label><span>Unit</span><select data-f="unit">${unitOptions(it.unit)}</select></label>
        <label><span>${ls ? 'Amount' : 'Rate'} <em>${ls ? 'lump sum' : 'per ' + esc(it.unit)}</em></span><input type="number" step="any" min="0" inputmode="decimal" data-f="rate" value="${esc(it.rate)}" /></label>
      </div>
      ${ls ? '' : `<div class="boq-rows">${it.rows.map(rowHtml).join('')}</div>
      <div class="row-add">
        <button type="button" class="btn ghost small" data-itemact="row">＋ Measurement</button>
        <button type="button" class="btn ghost small" data-itemact="ded">− Deduction</button>
      </div>`}
      <p class="item-foot">${footHtml(it, t)}</p>
      ${tools}
    </div>`;
  }

  function renderItems() {
    const tot = BOQ.projectTotals(project());
    const items = project().items;
    box.innerHTML = items.length
      ? items.map((it, i) => itemHtml(it, tot.items[i].sl)).join('')
      : `<div class="card empty">No items yet. Tap <b>＋ Add item</b> to start.</div>`;
  }

  /** Update calculated values of one item without re-rendering (keeps focus while typing). */
  function refreshItem(it) {
    const el = box.querySelector(`[data-item="${it.id}"]`);
    if (!el || it.kind === 'heading') return;
    (it.rows || []).forEach((r) => {
      const q = el.querySelector(`[data-row="${r.id}"] [data-r="qty"]`);
      if (q) q.placeholder = qtyText(BOQ.rowQty(Object.assign({}, r, { qty: '' })));
    });
    $('.item-foot', el).innerHTML = footHtml(it, BOQ.itemTotals(it));
  }

  box.addEventListener('input', (e) => {
    const itEl = e.target.closest('[data-item]');
    if (!itEl) return;
    const it = findItem(itEl.dataset.item);
    if (!it) return;
    const f = e.target.dataset.f;
    const rf = e.target.dataset.r;
    if (f) {
      it[f] = e.target.value;
      if (f === 'unit') {
        if (it.unit !== 'LS' && !it.rows.length) it.rows.push(BOQ.row('', 1));
        save();
        renderItems();
        renderSummary();
        return;
      }
    } else if (rf) {
      const r = it.rows.find((x) => x.id === e.target.closest('[data-row]').dataset.row);
      if (r) r[rf] = e.target.value;
    }
    save();
    refreshItem(it);
    renderSummary();
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-itemact],[data-rowact]');
    if (!b) return;
    const items = project().items;
    const it = findItem(b.closest('[data-item]').dataset.item);
    if (!it) return;
    const idx = items.indexOf(it);
    const ia = b.dataset.itemact;
    const ra = b.dataset.rowact;
    let focusRow = null;
    if (ia === 'up' && idx > 0) [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
    else if (ia === 'down' && idx < items.length - 1) [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]];
    else if (ia === 'copy') items.splice(idx + 1, 0, BOQ.cloneItem(it));
    else if (ia === 'del') {
      const name = it.desc ? `"${it.desc.slice(0, 60)}"` : 'this item';
      if (!confirm(`Delete ${name}?`)) return;
      items.splice(idx, 1);
    } else if (ia === 'row' || ia === 'ded') {
      const r = ia === 'ded' ? BOQ.ded('', 1) : BOQ.row('', 1);
      it.rows.push(r);
      focusRow = r.id;
    } else if (ra) {
      const rowEl = b.closest('[data-row]');
      const r = it.rows.find((x) => x.id === rowEl.dataset.row);
      if (!r) return;
      if (ra === 'del') it.rows = it.rows.filter((x) => x !== r);
      if (ra === 'ded') r.ded = !r.ded;
    } else return;
    save();
    renderItems();
    renderSummary();
    if (focusRow) {
      const inp = box.querySelector(`[data-row="${focusRow}"] [data-r="desc"]`);
      if (inp) inp.focus();
    }
  });

  $('#boqAdd').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    const it = b.dataset.add === 'heading' ? BOQ.heading('') : b.dataset.add === 'ls' ? BOQ.item('', 'LS', '') : BOQ.item('', 'm³', '', [BOQ.row('', 1)]);
    project().items.push(it);
    save();
    renderItems();
    renderSummary();
    const el = box.querySelector(`[data-item="${it.id}"] [data-f="desc"]`);
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // ---------------------------------------------------------------- summary (abstract) + printable sheet
  function renderSummary() {
    const p = project();
    const t = BOQ.projectTotals(p);
    const rows = p.items
      .map((it, i) => {
        const x = t.items[i];
        if (it.kind === 'heading') return `<tr class="sec"><td colspan="6">${esc(it.desc || 'Section')}</td></tr>`;
        return `<tr><td>${x.sl}</td><td class="part">${esc(it.desc || '—')}</td><td>${it.unit === 'LS' ? '' : fmt(x.qty, 2)}</td><td>${esc(it.unit)}</td><td>${fmt(x.rate, 2)}</td><td>${fmt(x.amount, 2)}</td></tr>`;
      })
      .join('');
    const taxRows = t.taxPct
      ? `<tr><td></td><td colspan="4">Sub total</td><td>${fmt(t.subtotal, 2)}</td></tr><tr><td></td><td colspan="4">GST / tax @ ${fmt(t.taxPct, 2)} %</td><td>${fmt(t.tax, 2)}</td></tr>`
      : '';
    $('#boqSummary').innerHTML = `<div class="card no-print">
      <div class="result-head"><h3>Abstract of estimate</h3><span class="meta">${t.count} item${t.count === 1 ? '' : 's'}</span></div>
      <div class="cost-line"><span>Total amount</span><span>${money(t.total)}</span></div>
      <p class="hint small words">${esc(BOQ.amountInWords(t.total))}</p>
      <div class="table-wrap"><table class="table boq-abstract">
        <thead><tr><th>Sl</th><th>Particular</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>${taxRows}<tr><td></td><td colspan="4">Total amount</td><td>${fmt(t.total, 2)}</td></tr></tfoot>
      </table></div>
      <div class="result-actions">
        <button type="button" class="btn primary small" data-act="print">Print / PDF</button>
        <button type="button" class="btn ghost small" id="boqCsv">Export CSV</button>
        <button type="button" class="btn ghost small" id="boqShare">Share</button>
      </div>
    </div>`;
    $('#boqCsv').onclick = downloadCsv;
    $('#boqShare').onclick = shareSummary;
    renderPrint(p, t);
  }

  function renderPrint(p, t) {
    const n = (v, d = 2) => (v === '' || v == null || !Number.isFinite(parseFloat(v)) ? '' : fmt(parseFloat(v), d));
    const body = p.items
      .map((it, i) => {
        const x = t.items[i];
        if (it.kind === 'heading') return `<tr class="sec"><td colspan="9">${esc(it.desc)}</td></tr>`;
        let html = `<tr class="part"><td>${x.sl}</td><td colspan="8">${esc(it.desc)}</td></tr>`;
        if (it.unit === 'LS') return html.replace('<td colspan="8">', '<td colspan="7">').replace('</td></tr>', `</td><td class="amt">${fmt(x.amount, 2)}</td></tr>`);
        let dedHead = false;
        it.rows.forEach((r) => {
          if (r.ded && !dedHead) {
            html += `<tr class="dedrow"><td></td><td colspan="8">Deductions</td></tr>`;
            dedHead = true;
          }
          html += `<tr${r.ded ? ' class="dedrow"' : ''}><td></td><td>${esc(r.desc)}</td><td>${n(r.nos, 0)}</td><td>${n(r.l)}</td><td>${n(r.w)}</td><td>${n(r.h)}</td><td>${fmt(BOQ.rowQty(r), 2)}</td><td></td><td></td></tr>`;
        });
        if (x.deduction)
          html += `<tr><td></td><td colspan="5" class="lbl">Total</td><td>${fmt(x.gross, 2)}</td><td></td><td></td></tr>
            <tr class="dedrow"><td></td><td colspan="5" class="lbl">Total deduction</td><td>${fmt(x.deduction, 2)}</td><td></td><td></td></tr>`;
        html += `<tr class="tot"><td></td><td colspan="5" class="lbl">Total (${esc(it.unit)})</td><td>${fmt(x.qty, 2)}</td><td>${fmt(x.rate, 2)}</td><td class="amt">${fmt(x.amount, 2)}</td></tr>`;
        return html;
      })
      .join('');
    const taxRows = t.taxPct
      ? `<tr class="tot"><td></td><td colspan="7" class="lbl">Sub total</td><td class="amt">${fmt(t.subtotal, 2)}</td></tr>
         <tr class="tot"><td></td><td colspan="7" class="lbl">GST / tax @ ${fmt(t.taxPct, 2)} %</td><td class="amt">${fmt(t.tax, 2)}</td></tr>`
      : '';
    const date = p.date ? new Date(p.date + 'T00:00').toLocaleDateString('en-GB') : '';
    $('#boqPrint').innerHTML = `
      <div class="sheet-head">
        ${company.name ? `<h3>${esc(company.name)}</h3>` : ''}
        ${company.address ? `<p>${esc(company.address)}</p>` : ''}
        <h4>${esc(p.title || 'Estimate')}</h4>
      </div>
      <table class="sheet-info"><tr><td>Type of work: ${esc(p.workType)}</td><td>Date: ${esc(date)}</td></tr>
        <tr><td>Client name: ${esc(p.client)}</td><td>Est. no: ${esc(p.estNo)}</td></tr>
        <tr><td colspan="2">Place: ${esc(p.place)}</td></tr></table>
      <table class="sheet">
        <thead><tr><th rowspan="2">Sl no</th><th rowspan="2">Particular</th><th rowspan="2">Nos</th><th colspan="3">Measurement in metres</th><th rowspan="2">Quantity</th><th rowspan="2">Rate</th><th rowspan="2">Amount (${esc(cur())})</th></tr>
          <tr><th>Length</th><th>Width</th><th>Height / depth</th></tr></thead>
        <tbody>${body}${taxRows}<tr class="grand"><td></td><td colspan="2">TOTAL AMOUNT</td><td colspan="5">${esc(BOQ.amountInWords(t.total))}</td><td class="amt">${fmt(t.total, 2)}</td></tr></tbody>
      </table>
      <div class="sign"><div>OWNER<br /><b>${esc(p.client)}</b></div><div>ENGINEER<br /><b>${esc(company.engineer)}</b></div></div>`;
  }

  // ---------------------------------------------------------------- export / share
  const fileName = (ext) => (project().name || 'project-estimate').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.' + ext;
  function download(text, name, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  function downloadCsv() {
    const p = project();
    const t = BOQ.projectTotals(p);
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const out = [
      [p.title],
      ['Client', p.client, '', 'Date', p.date],
      ['Place', p.place, '', 'Est. no', p.estNo],
      [],
      ['Sl no', 'Particular', 'Nos', 'Length', 'Width', 'Height/Depth', 'Quantity', 'Unit', 'Rate', 'Amount'],
    ];
    p.items.forEach((it, i) => {
      const x = t.items[i];
      if (it.kind === 'heading') return out.push(['', it.desc]);
      out.push([x.sl, it.desc]);
      if (it.unit !== 'LS')
        it.rows.forEach((r) => out.push(['', (r.ded ? 'Deduct: ' : '') + r.desc, r.nos, r.l, r.w, r.h, ((r.ded ? -1 : 1) * BOQ.rowQty(r)).toFixed(3)]));
      out.push(['', 'Total', '', '', '', '', it.unit === 'LS' ? '' : x.qty.toFixed(2), it.unit, x.rate.toFixed(2), x.amount.toFixed(2)]);
    });
    out.push([]);
    if (t.taxPct) {
      out.push(['', 'Sub total', '', '', '', '', '', '', '', t.subtotal.toFixed(2)]);
      out.push(['', `GST / tax @ ${t.taxPct}%`, '', '', '', '', '', '', '', t.tax.toFixed(2)]);
    }
    out.push(['', 'TOTAL AMOUNT', '', '', '', '', '', '', '', t.total.toFixed(2)]);
    out.push(['', BOQ.amountInWords(t.total)]);
    download('﻿' + out.map((r) => r.map(q).join(',')).join('\r\n'), fileName('csv'), 'text/csv;charset=utf-8');
  }

  async function shareSummary() {
    const p = project();
    const t = BOQ.projectTotals(p);
    const lines = [`${p.title || 'Estimate'}${p.client ? ` – ${p.client}` : ''}${p.place ? `, ${p.place}` : ''}`, ''];
    p.items.forEach((it, i) => {
      const x = t.items[i];
      if (it.kind === 'heading') lines.push(`— ${it.desc} —`);
      else lines.push(`${x.sl}. ${it.desc}: ${it.unit === 'LS' ? 'LS' : `${fmt(x.qty, 2)} ${it.unit} × ${fmt(x.rate, 2)}`} = ${money(x.amount)}`);
    });
    lines.push('');
    if (t.taxPct) lines.push(`Sub total: ${money(t.subtotal)}`, `GST / tax @ ${t.taxPct}%: ${money(t.tax)}`);
    lines.push(`TOTAL: ${money(t.total)}`, BOQ.amountInWords(t.total));
    const text = lines.join('\n');
    if (navigator.share) {
      try {
        await navigator.share({ title: p.name, text });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard');
    } catch (e) {
      toast('Could not copy');
    }
  }

  // ---------------------------------------------------------------- init
  const listeners = [];
  function renderAll() {
    renderSelect();
    fillDetails();
    renderItems();
    renderSummary();
    listeners.forEach((fn) => fn());
  }
  // shared with the stage-certificate module
  window.BOQApp = {
    project,
    save,
    company,
    toast,
    projects: () => projects,
    select(id) {
      currentId = id;
      save();
      renderAll();
    },
    create(name) {
      addProject(BOQ.newProject(name), 'New project created');
    },
    onProjectChange: (fn) => listeners.push(fn),
  };
  renderAll();
})();
