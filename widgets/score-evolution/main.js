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

  function renderChart(history, threshold) {
    const W = 600;
    const H = 200;
    const PAD_L = 36, PAD_R = 30, PAD_T = 18, PAD_B = 30;
    const innerW = W - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;

    const yMin = 0;
    const yMax = 100;
    const yToPx = (v) => PAD_T + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
    const xStep = history.length > 1 ? innerW / (history.length - 1) : 0;
    const xToPx = (i) => PAD_L + i * xStep;

    const linePts = history.map((p, i) => `${xToPx(i)},${yToPx(p.score)}`).join(' ');

    const yTicks = [0, 25, 50, 75, 100];
    const yAxis = yTicks.map(t => `
      <line class="axis-line" x1="${PAD_L}" x2="${W - PAD_R}" y1="${yToPx(t)}" y2="${yToPx(t)}" opacity="0.35"/>
      <text class="axis-label" x="${PAD_L - 6}" y="${yToPx(t) + 3}" text-anchor="end">${t}</text>
    `).join('');

    const thresholdLine = threshold !== undefined ? `
      <line class="threshold" x1="${PAD_L}" x2="${W - PAD_R}" y1="${yToPx(threshold)}" y2="${yToPx(threshold)}"/>
      <text class="threshold-label" x="${W - PAD_R - 4}" y="${yToPx(threshold) - 4}" text-anchor="end">reject &lt; ${threshold}</text>
    ` : '';

    const dots = history.map((p, i) => {
      const cls = threshold !== undefined ? (p.score >= threshold ? 'above' : 'below') : '';
      return `
        <circle class="dot ${cls}" cx="${xToPx(i)}" cy="${yToPx(p.score)}" r="5"/>
        <text class="score-label" x="${xToPx(i)}" y="${yToPx(p.score) - 12}" text-anchor="middle">${p.score}</text>
        <text class="ver-label" x="${xToPx(i)}" y="${H - PAD_B + 16}">${escapeHtml(p.version)}</text>
      `;
    }).join('');

    return `
      <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        ${yAxis}
        ${thresholdLine}
        <polyline class="line" points="${linePts}" />
        ${dots}
      </svg>
    `;
  }

  function deltaCell(prev, curr) {
    if (prev === null || prev === undefined) return { cls: 'zero', text: '—' };
    const d = curr - prev;
    if (Math.abs(d) < 0.05) return { cls: 'zero', text: '0.0' };
    const sign = d > 0 ? '+' : '−';
    return { cls: d > 0 ? 'up' : 'down', text: sign + Math.abs(d).toFixed(1) };
  }

  function renderBreakdown(history) {
    const rows = history.map((p, i) => {
      const d = deltaCell(i === 0 ? null : history[i - 1].score, p.score);
      return `
        <div class="row">
          <div class="ver">${escapeHtml(p.version)}</div>
          <div class="change">${escapeHtml(p.note || '')}</div>
          <div class="score">${p.score}</div>
          <div class="delta ${d.cls}">${escapeHtml(d.text)}</div>
        </div>
      `;
    }).join('');
    return `
      <div class="breakdown">
        <div class="row header">
          <div>Rubric</div>
          <div>What changed</div>
          <div style="text-align:right">Score</div>
          <div style="text-align:right">Δ</div>
        </div>
        ${rows}
      </div>
    `;
  }

  function render(payload) {
    const root = document.getElementById('app');
    const history = payload.history || [];
    const last = history[history.length - 1];
    const verdictCls = payload.verdict === 'rejected' ? 'reject' : payload.verdict === 'accepted' ? 'accept' : 'review';
    const verdictText = (payload.verdict || 'in review').toUpperCase();

    root.innerHTML = `
      <div class="head">
        <div class="who">
          <h1>${escapeHtml(payload.candidate.name)}</h1>
          <span class="role">${escapeHtml(payload.candidate.role)}</span>
        </div>
        <span class="verdict ${verdictCls}">${escapeHtml(verdictText)}</span>
      </div>
      <div class="subhead">
        Re-scored against <strong>${history.length} rubric versions</strong> — same evidence, evolving skill.
        ${payload.subnote ? escapeHtml(payload.subnote) : ''}
      </div>

      <div class="chart-wrap">
        ${renderChart(history, payload.reject_threshold)}
      </div>

      ${renderBreakdown(history)}

      ${payload.takeaway ? `
        <div class="takeaway">
          <strong>Compound learning effect:</strong> ${escapeHtml(payload.takeaway)}
        </div>
      ` : ''}

      <div class="foot">
        <span class="pill">Same evidence · evolving rubric</span>
        <span>Source: <strong>hiring-scores</strong> · /${escapeHtml(payload.candidate.id || '')}</span>
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
        root.innerHTML = '<div class="loading">No score history found.</div>';
        return;
      }
      render(payload);
    } catch (err) {
      root.innerHTML = `<div class="loading" style="color:#f87171">${escapeHtml(err.message || String(err))}</div>`;
      console.error('score-evolution widget error', err);
    }
  }

  void boot();
})();
