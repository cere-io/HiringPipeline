(function () {
  'use strict';

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function scoreClass(score) {
    if (score >= 75) return 'high';
    if (score >= 60) return 'mid';
    return 'low';
  }

  function renderCard(s, kind) {
    const ratingPct = Math.max(0, Math.min(100, (s.rating / 10) * 100));
    const evidenceItems = (s.evidence || []).map(e => `<li>${escapeHtml(e)}</li>`).join('');
    return `
      <div class="card ${kind}">
        <div class="trait">${escapeHtml(s.trait)}</div>
        <div class="rating">
          <div class="bar"><div class="bar-fill" style="width:${ratingPct}%"></div></div>
          <div class="num">${s.rating.toFixed(1)}<span style="color:var(--muted);font-weight:400"> / 10</span></div>
        </div>
        <ul class="evidence">${evidenceItems}</ul>
        <div class="source">
          <span class="agent">${escapeHtml(s.surfaced_by || 'TraitExtractor')}</span>
          · ${escapeHtml(s.source || '')}
        </div>
      </div>
    `;
  }

  function render(payload) {
    const root = document.getElementById('app');
    const strengths = payload.strengths || [];
    const concerns = payload.concerns || [];
    const composite = payload.composite_score;

    root.innerHTML = `
      <div class="head">
        <div class="who">
          <h1>${escapeHtml(payload.candidate.name)}</h1>
          <span class="role">${escapeHtml(payload.candidate.role)}</span>
        </div>
        <div class="composite">
          <span class="score-num ${scoreClass(composite)}">${composite}</span>
          <span class="score-label">composite</span>
        </div>
      </div>
      <div class="subhead">
        Distilled across <strong>${escapeHtml(String(payload.rounds_count || 0))} rounds</strong>
        ${payload.rubric_version ? `· rubric ${escapeHtml(payload.rubric_version)}` : ''}
        ${payload.last_updated ? `· updated ${escapeHtml(payload.last_updated)}` : ''}
      </div>

      ${strengths.length ? `
        <div class="section-title strength">Strongest signals</div>
        <div class="cards">${strengths.map(s => renderCard(s, 'strength')).join('')}</div>
      ` : ''}

      ${concerns.length ? `
        <div class="section-title concern">Counter-patterns</div>
        <div class="cards">${concerns.map(s => renderCard(s, 'concern')).join('')}</div>
      ` : ''}

      <div class="foot">
        <span class="pill">Cross-round distillation</span>
        <span>Source: <strong>hiring-traits</strong> · /${escapeHtml(payload.candidate.id || '')}</span>
      </div>
    `;
  }

  function rowsToPayload(columns, rows) {
    if (!rows || !rows.length) return null;
    const colIdx = {};
    columns.forEach((c, i) => { colIdx[c] = i; });
    const r = rows[0];
    const v = (k) => r[colIdx[k]];
    let parsed;
    try {
      parsed = typeof v('payload') === 'string' ? JSON.parse(v('payload')) : v('payload');
    } catch (e) {
      parsed = null;
    }
    return parsed;
  }

  async function boot() {
    const root = document.getElementById('app');
    try {
      const sb = window.WidgetSandbox;
      if (!sb || !sb.manifestUrl) {
        throw new Error('WidgetSandbox not available — preview via the Cere Sandbox or run with sandbox-injector.js for local dev.');
      }
      const result = await window.WidgetRuntime.query(sb.manifestUrl);
      const payload = rowsToPayload(result.columns, result.rows);
      if (!payload) {
        root.innerHTML = '<div class="loading">No signals available.</div>';
        return;
      }
      render(payload);
    } catch (err) {
      root.innerHTML = `<div class="loading" style="color:#f87171">${escapeHtml(err.message || String(err))}</div>`;
      console.error('top-signals widget error', err);
    }
  }

  void boot();
})();
