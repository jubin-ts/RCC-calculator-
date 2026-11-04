/* RCC Calculator – stage certificates for a project: form, preview, PDF download / print */
(function () {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const app = window.BOQApp;
  if (!app) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------- state
  const certs = () => {
    const p = app.project();
    if (!Array.isArray(p.certificates)) p.certificates = [];
    p.certificates.forEach((c, i) => {
      if (!(c && c.id && Array.isArray(c.works))) p.certificates[i] = CERT.normalizeCertificate(c, p);
    });
    return p.certificates;
  };
  let currentId = null;
  const current = () => {
    const list = certs();
    return list.find((c) => c.id === currentId) || list[list.length - 1] || null;
  };

  const form = $('#certForm');
  const FIELDS = ['stage', 'title', 'building', 'syNo', 'village', 'ward', 'taluk', 'permitNo', 'permitDate', 'owner', 'progress', 'worksIntro', 'place', 'date', 'officer', 'officerDetails'];

  // ---------------------------------------------------------------- bar
  const sel = $('#certSelect');
  $('#certBar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cert]');
    if (!b) return;
    const p = app.project();
    const list = certs();
    const c = current();
    const act = b.dataset.cert;
    let n = null;
    if (act === 'project') {
      const name = prompt('Name of the new project', `Project ${app.projects().length + 1}`);
      if (name !== null) app.create(name.trim() || `Project ${app.projects().length + 1}`);
      return;
    }
    if (act === 'new') {
      n = CERT.newCertificate(p, c ? CERT.nextCertificate(p, c).stage : 'First');
      if (c) ['building', 'syNo', 'village', 'ward', 'taluk', 'permitNo', 'permitDate', 'owner', 'place', 'officer', 'officerDetails'].forEach((k) => (n[k] = c[k]));
    } else if (act === 'dup' && c) {
      n = CERT.normalizeCertificate(JSON.parse(JSON.stringify(c)), p);
      n.id = BOQ.uid();
      n.works.forEach((w) => (w.id = BOQ.uid()));
    } else if (act === 'delete' && c) {
      if (!confirm(`Delete the ${c.title.toLowerCase()} dated ${CERT.dmy(c.date)}?`)) return;
      p.certificates = list.filter((x) => x !== c);
      currentId = null;
      app.save();
      render();
      app.toast('Certificate deleted');
      return;
    }
    if (!n) return;
    list.push(n);
    currentId = n.id;
    app.save();
    render();
    app.toast('New certificate created');
  });
  sel.addEventListener('change', () => {
    currentId = sel.value;
    render();
  });
  const projSel = $('#certProjectSelect');
  projSel.addEventListener('change', () => app.select(projSel.value));

  // ---------------------------------------------------------------- form
  function workRow(w, i) {
    return `<div class="cert-work" data-work="${w.id}">
      <span class="sl">${i + 1}</span>
      <label class="w-desc"><span>Work done</span><textarea rows="2" data-w="desc" placeholder="e.g. WALL PAINTING WORK">${esc(w.desc)}</textarea></label>
      <label class="w-status"><span>Status</span><input type="text" data-w="status" value="${esc(w.status)}" list="certStatusList" /></label>
      <label class="w-amt"><span>Amount <em>Rs</em></span><input type="number" step="any" min="0" inputmode="decimal" data-w="amount" value="${esc(w.amount)}" /></label>
      <div class="row-btns">
        <button type="button" class="btn ghost small" data-wact="up" aria-label="Move up" title="Move up">↑</button>
        <button type="button" class="btn danger small" data-wact="del" aria-label="Delete work" title="Delete">✕</button>
      </div>
    </div>`;
  }

  function render() {
    const list = certs();
    const c = current();
    currentId = c ? c.id : null;
    projSel.innerHTML = app
      .projects()
      .map((p) => `<option value="${p.id}"${p === app.project() ? ' selected' : ''}>${esc(p.name || 'Untitled')}</option>`)
      .join('');
    sel.innerHTML = list.length
      ? list.map((x, i) => `<option value="${x.id}"${x === c ? ' selected' : ''}>${i + 1}. ${esc(x.title)} – ${esc(CERT.dmy(x.date))}</option>`).join('')
      : '<option>No certificates yet</option>';
    sel.disabled = !list.length;
    document.querySelectorAll('#certBar [data-cert="dup"], #certBar [data-cert="delete"]').forEach((b) => (b.disabled = !c));
    $('#certEmpty').hidden = !!c;
    form.hidden = !c;
    $('#certActions').hidden = !c;
    $('#certPreview').hidden = !c;
    if (!c) return;
    FIELDS.forEach((k) => {
      if (form.elements[k]) form.elements[k].value = c[k] ?? '';
    });
    $('#certWorks').innerHTML = c.works.map(workRow).join('');
    refresh();
  }

  function refresh() {
    const c = current();
    if (!c) return;
    const t = CERT.total(c);
    $('#certTotal').innerHTML = `Total amount: <b>Rs. ${CERT.inr(t)}</b><br /><small>${esc(CERT.words(t))}</small>`;
    renderPreview(c);
  }

  form.addEventListener('input', (e) => {
    const c = current();
    if (!c) return;
    const el = e.target;
    if (el.dataset.w) {
      const w = c.works.find((x) => x.id === el.closest('[data-work]').dataset.work);
      if (w) w[el.dataset.w] = el.value;
    } else if (FIELDS.includes(el.name)) {
      c[el.name] = el.value;
      if (el.name === 'stage') {
        c.title = CERT.titleFor(el.value);
        form.elements.title.value = c.title;
      }
      if (el.name === 'stage' || el.name === 'title' || el.name === 'date') {
        const opt = sel.querySelector(`option[value="${c.id}"]`);
        if (opt) opt.textContent = `${certs().indexOf(c) + 1}. ${c.title} – ${CERT.dmy(c.date)}`;
      }
    }
    app.save();
    refresh();
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  form.addEventListener('click', (e) => {
    const c = current();
    if (!c) return;
    const b = e.target.closest('[data-wact],[data-certact]');
    if (!b) return;
    if (b.dataset.certact === 'add') c.works.push(CERT.work());
    else if (b.dataset.certact === 'estimate') {
      const w = CERT.worksFromEstimate(app.project());
      if (!w.length) return alert('This project has no estimate items with an amount yet.');
      const hasWorks = c.works.some((x) => x.desc || x.amount);
      if (hasWorks && !confirm('Replace the works in this certificate with the items of the project estimate?')) return;
      c.works = w;
    } else if (b.dataset.certact === 'reset-text') {
      Object.assign(c, CERT.DEFAULT_TEXT);
    } else if (b.dataset.wact) {
      const i = c.works.findIndex((x) => x.id === b.closest('[data-work]').dataset.work);
      if (i < 0) return;
      if (b.dataset.wact === 'del') c.works.splice(i, 1);
      if (b.dataset.wact === 'up' && i > 0) [c.works[i - 1], c.works[i]] = [c.works[i], c.works[i - 1]];
    } else return;
    app.save();
    render();
  });

  // ---------------------------------------------------------------- HTML preview (also what "Print" prints)
  const workLine = (w) => [w.desc, w.status].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
  const fill = (v, cls) => `<span class="fill ${cls || ''}">${esc(v) || '&nbsp;'}</span>`;

  function renderPreview(c) {
    const t = CERT.total(c);
    const officer = String(c.officer || '').split('\n').map(esc).join('<br />');
    const details = String(c.officerDetails || '').trim();
    $('#certPreview').innerHTML = `<div class="cert-page">
      <h3 class="cert-title">${esc(c.title)}</h3>
      <p class="indent">This is to certify that I have inspected ${esc(c.building)} being constructed in</p>
      <p class="fields">Sy. No${fill(c.syNo, 'w3')}Village${fill(c.village, 'w3')}Ward${fill(c.ward, 'w2')}</p>
      <p class="fields">Taluk${fill(c.taluk, 'w3')}Permit Number${fill(c.permitNo, 'w3')}Dated${fill(CERT.dmy(c.permitDate), 'w2')}</p>
      <p class="fields">For Sri${fill(c.owner, 'w4')}<span class="spacer"></span></p>
      <p class="indent gap">${esc(c.progress)}</p>
      <p class="indent">${esc(c.worksIntro)}</p>
      <ol class="cert-works">${c.works
        .filter((w) => workLine(w) || w.amount !== '')
        .map((w, i) => `<li><span class="no">${i + 1}.</span><span class="d">${esc(workLine(w))}</span><span class="amt">${w.amount !== '' ? `RS: ${CERT.inr(w.amount)}` : ''}</span></li>`)
        .join('')}</ol>
      <p class="cert-total"><span>TOTAL AMOUNT: RS: ${CERT.inr(t)}</span></p>
      <p class="indent">According to my assessment the owner has spent a sum of <b>Rs. ${CERT.inr(t)} (</b>${esc(CERT.words(t))}<b>.)</b> till the date so far for the construction.</p>
      <div class="cert-sign">
        <div>Place : ${esc(c.place)}<br />Date : ${esc(CERT.dmy(c.date))}</div>
        <div class="officer">${details ? `<div class="od">${String(details).split('\n').map(esc).join('<br />')}</div>` : ''}${officer}</div>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- PDF (A4, drawn with jsPDF)
  let jsPdfPromise = null;
  function loadJsPdf() {
    if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
    if (!jsPdfPromise)
      jsPdfPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'js/vendor/jspdf.umd.min.js';
        s.onload = () => resolve(window.jspdf.jsPDF);
        s.onerror = () => {
          jsPdfPromise = null;
          reject(new Error('Could not load the PDF library. Check your connection and try again.'));
        };
        document.head.appendChild(s);
      });
    return jsPdfPromise;
  }

  // jsPDF's built-in fonts only cover Latin-1 / Windows-1252; replace what they cannot draw
  const pdfText = (s) =>
    String(s ?? '')
      .replace(/₹/g, 'Rs.')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[^\x00-\xff–—•…€]/g, '?');

  function buildPdf(jsPDF, c) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const L = 20; // left margin
    const R = 190; // right edge
    const W = R - L;
    const BODY = 11;
    let y = 32;
    const ensure = (h) => {
      if (y + h > 280) {
        doc.addPage();
        y = 25;
      }
    };
    const font = (style, size) => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size || BODY);
    };

    // title
    doc.setFont('times', 'bold');
    doc.setFontSize(17);
    const title = pdfText(c.title);
    const tw = doc.getTextWidth(title);
    doc.text(title, 105, y, { align: 'center' });
    doc.setLineWidth(0.35);
    doc.line(105 - tw / 2 - 1, y + 1.8, 105 + tw / 2 + 1, y + 1.8);
    y += 16;

    font('normal');
    doc.text(pdfText(`This is to certify that I have inspected ${c.building} being constructed in`), L + 22, y);
    y += 11;

    // label …… value …… rows
    const fieldRow = (fields) => {
      font('normal');
      const labelW = fields.reduce((a, f) => a + (f.label ? doc.getTextWidth(f.label) + 1 : 0), 0);
      const weights = fields.reduce((a, f) => a + f.weight, 0);
      const free = W - labelW;
      let x = L;
      fields.forEach((f) => {
        if (f.label) {
          font('normal');
          doc.text(f.label, x, y);
          x += doc.getTextWidth(f.label) + 1;
        }
        const fw = (free * f.weight) / weights;
        if (f.value !== undefined) {
          doc.setLineDashPattern([0.4, 0.8], 0);
          doc.setLineWidth(0.25);
          doc.line(x, y + 0.8, x + fw - 1.5, y + 0.8);
          doc.setLineDashPattern([], 0);
          const v = pdfText(f.value);
          if (v) {
            let size = 10.5;
            font('bold', size);
            while (doc.getTextWidth(v) > fw - 3 && size > 6) font('bold', (size -= 0.5));
            doc.text(v, x + (fw - 1.5) / 2, y - 0.6, { align: 'center' });
          }
        }
        x += fw;
      });
      y += 10;
    };
    fieldRow([
      { label: 'Sy. No', value: c.syNo, weight: 3 },
      { label: 'Village', value: c.village, weight: 3 },
      { label: 'Ward', value: c.ward, weight: 2 },
    ]);
    fieldRow([
      { label: 'Taluk', value: c.taluk, weight: 3 },
      { label: 'Permit Number', value: c.permitNo, weight: 3.2 },
      { label: 'Dated', value: CERT.dmy(c.permitDate), weight: 1.8 },
    ]);
    fieldRow([
      { label: 'For Sri', value: c.owner, weight: 4 },
      { label: '', weight: 4.5 },
    ]);
    y += 10;

    // paragraphs with an indented first line; parts = [[text, bold], …]
    const para = (parts, indent = 15, lh = 6.2) => {
      const words = [];
      parts.forEach(([text, bold]) =>
        pdfText(text)
          .split(/(\s+)/)
          .filter((s) => s !== '')
          .forEach((s) => words.push({ s, bold }))
      );
      let line = [];
      let lineW = 0;
      let first = true;
      const flush = (justify) => {
        while (line.length && /^\s+$/.test(line[line.length - 1].s)) line.pop();
        const x0 = L + (first ? indent : 0);
        const avail = R - x0;
        const width = line.reduce((a, t) => a + t.w, 0);
        const gaps = line.filter((t) => /^\s+$/.test(t.s)).length;
        const extra = justify && gaps ? (avail - width) / gaps : 0;
        let x = x0;
        ensure(lh);
        line.forEach((t) => {
          if (/^\s+$/.test(t.s)) x += t.w + extra;
          else {
            font(t.bold ? 'bold' : 'normal');
            doc.text(t.s, x, y);
            x += t.w;
          }
        });
        y += lh;
        line = [];
        lineW = 0;
        first = false;
      };
      words.forEach((t) => {
        font(t.bold ? 'bold' : 'normal');
        t.w = /^\s+$/.test(t.s) ? doc.getTextWidth(' ') : doc.getTextWidth(t.s);
        const avail = R - (L + (first ? indent : 0));
        if (lineW + t.w > avail && line.length && !/^\s+$/.test(t.s)) flush(true);
        if (!line.length && /^\s+$/.test(t.s)) return;
        line.push(t);
        lineW += t.w;
      });
      if (line.length) flush(false);
    };
    para([[c.progress, false]], 22, 7);
    y += 1;
    para([[c.worksIntro, false]], 22, 7);
    y += 7;

    // works
    const descW = 122;
    c.works
      .filter((w) => workLine(w) || w.amount !== '')
      .forEach((w, i) => {
        font('normal');
        const lines = doc.splitTextToSize(pdfText(workLine(w)), descW);
        ensure(lines.length * 8.5);
        doc.text(`${i + 1}.`, L + 2, y);
        lines.forEach((ln, j) => {
          doc.text(ln, L + 9, y);
          if (j === lines.length - 1 && w.amount !== '') doc.text(`RS: ${CERT.inr(w.amount)}`, R, y, { align: 'right' });
          y += 8.5;
        });
      });
    y += 4;

    // total
    const t = CERT.total(c);
    ensure(12);
    font('bold', 12);
    const tt = `TOTAL AMOUNT: RS: ${CERT.inr(t)}`;
    doc.text(tt, R, y, { align: 'right' });
    doc.setLineWidth(0.35);
    doc.line(R - doc.getTextWidth(tt), y + 1.4, R, y + 1.4);
    y += 12;

    para(
      [
        ['According to my assessment the owner has spent a sum of ', false],
        [`Rs. ${CERT.inr(t)} (`, true],
        [CERT.words(t), false],
        ['.)', true],
        [' till the date so far for the construction.', false],
      ],
      12,
      7
    );

    // signature block – leave room for the signature and office seal
    const officer = pdfText(c.officer).split('\n');
    const details = pdfText(c.officerDetails).split('\n').filter((s) => s.trim());
    const blockH = 38 + (officer.length + details.length) * 5.5;
    ensure(blockH);
    y = Math.max(y + 38, 252 - (officer.length - 2) * 5.5 - details.length * 5);
    if (y + (officer.length + details.length) * 5.5 > 285) {
      doc.addPage();
      y = 60;
    }
    font('normal', 9.5);
    details.forEach((ln) => {
      doc.text(ln, 150, y, { align: 'center' });
      y += 4.6;
    });
    if (details.length) y += 1.5;
    const signY = y;
    font('normal', BODY);
    officer.forEach((ln, i) => doc.text(ln, 150, signY + i * 5.5, { align: 'center' }));
    doc.text(pdfText(`Place  : ${c.place}`), L + 2, signY);
    doc.text(pdfText(`Date   : ${CERT.dmy(c.date)}`), L + 2, signY + 5.5);
    return doc;
  }

  const fileName = (c) =>
    `${c.title}-${c.owner || app.project().name}-${CERT.dmy(c.date)}`.replace(/[\/\\]/g, '-').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') + '.pdf';

  async function makePdf() {
    const c = current();
    if (!c) return null;
    try {
      const jsPDF = await loadJsPdf();
      return { doc: buildPdf(jsPDF, c), name: fileName(c) };
    } catch (e) {
      alert(e.message);
      return null;
    }
  }

  $('#certActions').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pdf]');
    if (!b) return;
    if (b.dataset.pdf === 'print') return window.print();
    const r = await makePdf();
    if (!r) return;
    if (b.dataset.pdf === 'download') {
      r.doc.save(r.name);
      app.toast('PDF downloaded');
    } else if (b.dataset.pdf === 'open') {
      window.open(r.doc.output('bloburl'), '_blank');
    } else if (b.dataset.pdf === 'share') {
      const file = new File([r.doc.output('blob')], r.name, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: current().title });
        } catch (err) {
          /* cancelled */
        }
      } else {
        r.doc.save(r.name);
        app.toast('Sharing is not supported here – PDF downloaded');
      }
    }
  });

  // ---------------------------------------------------------------- init
  form.elements.stage.innerHTML = CERT.STAGES.map((s) => `<option value="${s}">${s}${s === 'Completion' ? '' : ' stage'}</option>`).join('');
  app.onProjectChange(() => {
    currentId = null;
    render();
  });
  document.querySelector('.bottomnav [data-view="cert"]').addEventListener('click', render);
  render();

  // exposed for tests
  window.CERT_UI = { buildPdf, loadJsPdf, current };
})();
