/*
 * RCC Calculator – stage certificate data helpers.
 * Pure functions only (no DOM), so they can be unit-tested with Node.
 */
(function (root) {
  'use strict';

  const BOQ = typeof module !== 'undefined' && module.exports ? require('./boq.js') : root.BOQ;

  const STAGES = ['First', 'Second', 'Third', 'Fourth', 'Final', 'Completion'];

  const DEFAULT_TEXT = {
    building: 'the new house',
    progress: 'The Construction is in progress according to the Plan / Estimate and has reached the level indicated below.',
    worksIntro: 'The following construction works were completed during my site visit.',
    officer: 'Name & Signature of Inspecting\nOfficer with Office Seal',
  };

  const titleFor = (stage) => (stage === 'Completion' ? 'COMPLETION CERTIFICATE' : `${String(stage || '').toUpperCase()} STAGE CERTIFICATE`);

  const num = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  /** Indian grouping, no decimals unless needed: 1347315 → "13,47,315" */
  function inr(n) {
    n = num(n);
    const whole = Math.abs(n - Math.round(n)) < 0.005;
    return n.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  }

  /** 1347315 → "Thirteen lakh forty seven thousand three hundred fifteen rupees only" */
  function words(amount) {
    const a = Math.round(Math.abs(num(amount)) * 100);
    const rupees = Math.floor(a / 100);
    const paise = a % 100;
    let s = BOQ.intToWords(rupees).toLowerCase() + ' rupees';
    if (paise) s += ' and ' + BOQ.intToWords(paise).toLowerCase() + ' paise';
    s += ' only';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  const total = (cert) => (cert.works || []).reduce((a, w) => a + num(w.amount), 0);

  const today = () => new Date().toISOString().slice(0, 10);
  /** "2024-10-08" → "08/10/2024"; other text is returned as it is. */
  function dmy(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : d || '';
  }

  const work = (desc, amount, status) => ({ id: BOQ.uid(), desc: desc || '', status: status ?? 'COMPLETED', amount: amount ?? '' });

  function newCertificate(project, stage) {
    stage = stage || 'First';
    return Object.assign(
      {
        id: BOQ.uid(),
        stage,
        title: titleFor(stage),
        syNo: '',
        village: '',
        ward: '',
        taluk: '',
        permitNo: '',
        permitDate: '',
        owner: (project && project.client) || '',
        place: (project && project.place) || '',
        date: today(),
        officerDetails: '',
        works: [work()],
      },
      DEFAULT_TEXT
    );
  }

  /** Next stage certificate: same site and permit details, next stage, empty works. */
  function nextCertificate(project, prev) {
    const i = STAGES.indexOf(prev.stage);
    const stage = STAGES[Math.min(i + 1, STAGES.length - 1)] || 'Final';
    const c = Object.assign(JSON.parse(JSON.stringify(prev)), { id: BOQ.uid(), stage, title: titleFor(stage), date: today(), works: [work()] });
    return c;
  }

  /** Works from the project's estimate: one per item, with its amount rounded to the rupee. */
  function worksFromEstimate(project) {
    const t = BOQ.projectTotals(project);
    return (project.items || [])
      .map((it, i) => ({ it, x: t.items[i] }))
      .filter(({ it, x }) => it.kind !== 'heading' && x.amount)
      .map(({ it, x }) => work(String(it.desc || '').toUpperCase(), Math.round(x.amount)));
  }

  function normalizeCertificate(c, project) {
    const base = newCertificate(project, c && c.stage);
    const out = Object.assign(base, c || {});
    out.works = Array.isArray(out.works) ? out.works.map((w) => Object.assign(work(), w, { id: w.id || BOQ.uid() })) : [];
    return out;
  }

  const api = { STAGES, DEFAULT_TEXT, titleFor, inr, words, total, dmy, work, newCertificate, nextCertificate, worksFromEstimate, normalizeCertificate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CERT = api;
})(typeof window !== 'undefined' ? window : globalThis);
