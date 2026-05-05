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

  function fmtPct(n) {
    return (n * 100).toFixed(0) + '%';
  }

  function deltaCell(oldVal, newVal) {
    const d = newVal - oldVal;
    if (Math.abs(d) < 0.0005) return { cls: 'zero', text: '—' };
    const sign = d > 0 ? '+' : '−';
    return {
      cls: d > 0 ? 'up' : 'down',
      text: sign + (Math.abs(d) * 100).toFixed(1) + 'pt',
    };
  }

  function renderWeightRow(trait, oldW, newW) {
    const delta = deltaCell(oldW, newW);
    const maxBar = 80;
    const oldBarW = Math.round(oldW * maxBar);
    const newBarW = Math.round(newW * maxBar);
    return `
      <div class="row">
        <div class="trait">
          ${escapeHtml(trait)}
          <div class="bar"><div class="bar-fill" style="width:${newBarW}px"></div></div>
        </div>
        <div class="old">${fmtPct(oldW)}</div>
        <div class="old">→</div>
        <div class="new">${fmtPct(newW)}</div>
        <div class="delta ${delta.cls}">${escapeHtml(delta.text)}</div>
      </div>
    `;
  }

  function renderRubricDiff(lines) {
    return lines.map(function (line) {
      const cls = line.op || 'context';
      const marker = cls === 'add' ? '+' : cls === 'remove' ? '−' : cls === 'modify' ? '~' : ' ';
      return `<div class="line ${cls}"><span class="marker">${marker}</span><span class="text">${escapeHtml(line.text)}</span></div>`;
    }).join('');
  }

  function renderTriggers(events) {
    return events.map(function (e) {
      return `
        <div class="trigger">
          <span class="who">${escapeHtml(e.who)}</span>
          <span class="what">${escapeHtml(e.what)}</span>
          <span class="when">${escapeHtml(e.when)}</span>
        </div>
      `;
    }).join('');
  }

  function render(payload) {
    const root = document.getElementById('app');
    const traits = payload.traits || [];
    const oldVer = payload.versions.previous;
    const newVer = payload.versions.current;

    root.innerHTML = `
      <div class="head">
        <h1>${escapeHtml(payload.role)} — Compound Learning</h1>
        <div class="versions">
          <span class="v-old">${escapeHtml(oldVer)}</span>
          <span class="v-arrow">→</span>
          <span class="v-new">${escapeHtml(newVer)}</span>
        </div>
      </div>
      <div class="subhead">
        Skill updated by <strong>${escapeHtml(String(payload.feedback_count))} interviewer feedback events</strong>.
        ${escapeHtml(payload.window || '')}
      </div>

      <div class="section-title">Trait weights</div>
      <div class="weights">
        <div class="row header">
          <div>Trait</div>
          <div class="old">prev</div>
          <div></div>
          <div class="new">new</div>
          <div class="delta">Δ</div>
        </div>
        ${traits.map(t => renderWeightRow(t.name, t.old, t.new)).join('')}
      </div>

      <div class="section-title">Rubric guidance — diff</div>
      <div class="rubric-diff">
        ${renderRubricDiff(payload.rubric_diff || [])}
      </div>

      <div class="section-title">Trigger events</div>
      <div class="triggers">
        ${renderTriggers(payload.triggers || [])}
      </div>

      <div class="foot">
        <span class="pill">Compounded</span>
        <span>Source: <strong>hiring-meta</strong> · /trait_weights/${escapeHtml(payload.role_key || '')}</span>
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
        root.innerHTML = '<div class="loading">No rubric versions found.</div>';
        return;
      }
      render(payload);
    } catch (err) {
      root.innerHTML = `<div class="loading" style="color:#f87171">${escapeHtml(err.message || String(err))}</div>`;
      console.error('rubric-diff widget error', err);
    }
  }

  void boot();
})();
