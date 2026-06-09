import { SessionAnalysis } from './analyzer';
import { Messages } from './i18n';

export interface SetupStatus {
  chatEnabled: boolean;
  cliConfigured: boolean;
}

export function buildWebviewHtml(sessions: SessionAnalysis[], m: Messages, locale: string, setupStatus: SetupStatus): string {
  const sorted = [...sessions].sort((a, b) => b.startTime - a.startTime);
  const chartData = JSON.stringify(
    sorted.map(s => ({
      d: new Date(s.startTime).toISOString().slice(0, 10),
      c: s.totalCredits,
      p: s.projectName || '',
      src: s.source || 'chat',
      ts: s.startTime,
    }))
  );

  const sessionRows = sorted.map(s => {
    const date = new Date(s.startTime).toLocaleString();
    const issueCount = s.issues.length;
    const highCount = s.issues.filter(i => i.severity === 'high').length;
    const severityClass = highCount > 0 ? 'high' : issueCount > 0 ? 'medium' : 'ok';
    const severityLabel = highCount > 0 ? m.evalHighIssue(highCount) : issueCount > 0 ? m.evalMediumIssue(issueCount) : m.evalOk;
    const creditsDisplay = s.totalCredits > 0 ? s.totalCredits.toFixed(1) : '0';

    const turnClass = s.turnCount <= 10 ? 'good' : s.turnCount <= 20 ? 'warn' : 'bad';
    const inputK = s.totalInputTokens / 1000;
    const inputClass = inputK < 100 ? 'good' : inputK < 500 ? 'warn' : 'bad';
    const cacheClass = s.cacheRate >= 0.6 ? 'good' : s.cacheRate >= 0.3 ? 'warn' : 'bad';
    const toolRatio = s.definedToolCount > 0 ? s.usedToolCount / s.definedToolCount : null;
    const toolClass = toolRatio === null ? '' : toolRatio >= 0.75 ? 'good' : toolRatio >= 0.5 ? 'warn' : 'bad';
    const toolDisplay = s.usedToolCount === 0 && s.definedToolCount === 0
      ? '-'
      : s.definedToolCount === 0
        ? `${s.usedToolCount} / ?`
        : `${s.usedToolCount} / ${s.definedToolCount}`;

    const sourceBadge = s.source === 'cli'
      ? `<span class="source-badge cli">CLI</span>`
      : `<span class="source-badge chat">Chat</span>`;
    return `
      <tr class="session-row ${severityClass}" data-session="${s.sessionId}" data-project="${s.projectName || ''}" data-ts="${s.startTime}" data-source="${s.source || 'chat'}" onclick="showDetail('${s.sessionId}')">
        <td>${date}</td>
        <td>${s.projectName || '-'} ${sourceBadge}</td>
        <td title="${s.title || ''}" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.title || '-'}</td>
        <td>${s.durationMin}</td>
        <td class="cell-${turnClass}">${s.turnCount}</td>
        <td class="cell-${inputClass}">${inputK.toFixed(1)}K</td>
        <td class="cell-${cacheClass}">${(s.cacheRate * 100).toFixed(0)}%</td>
        <td class="cell-${toolClass}">${toolDisplay}</td>
        <td class="credits">${creditsDisplay}</td>
        <td class="severity ${severityClass}">${severityLabel}</td>
      </tr>`;
  }).join('');

  const detailSections = sorted.map(s => {
    const issueHtml = s.issues.length === 0
      ? `<p class="no-issues">${m.noIssues}</p>`
      : s.issues.map(issue => `
          <div class="issue ${issue.severity}">
            <div class="issue-header">
              <span class="habit-badge">${m.habitLabel}${issue.habit}</span>
              <span class="severity-icon">${issue.severity === 'high' ? '⚠' : issue.severity === 'medium' ? '△' : 'ℹ'}</span>
              <strong>${issue.title}</strong>
            </div>
            <p>${issue.description}</p>
            ${issue.metric ? `<code>${issue.metric}</code>` : ''}
          </div>`).join('');


    const llmBreakdownHtml = buildLlmBreakdown(s, m);

    return `
      <div class="detail-panel" id="detail-${s.sessionId}" style="display:none">
        <div class="detail-header">
          <h3>${m.sessionDetail}</h3>
          ${s.projectName ? `<span style="font-size:12px;color:var(--vscode-foreground)">${s.projectName}</span>` : ''}
          <small>${s.sessionId}</small>
        </div>
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-label">${m.metricTotalInput} <span class="habit-badge">${m.habitLabel}2</span></div>
            <div class="metric-value">${(s.totalInputTokens / 1000).toFixed(1)}K</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">${m.metricCached} <span class="habit-badge">${m.habitLabel}3</span></div>
            <div class="metric-value">${(s.totalCachedTokens / 1000).toFixed(1)}K</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">${m.metricCacheRate} <span class="habit-badge">${m.habitLabel}3</span></div>
            <div class="metric-value ${s.cacheRate >= 0.6 ? 'good' : s.cacheRate >= 0.3 ? 'warn' : 'bad'}">${(s.cacheRate * 100).toFixed(1)}%</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">${m.metricAvgInputPerTurn} <span class="habit-badge">${m.habitLabel}2</span></div>
            <div class="metric-value">${(s.avgInputTokensPerTurn / 1000).toFixed(1)}K</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">${m.metricCredits}</div>
            <div class="metric-value" style="color:var(--vscode-charts-yellow,#cca700)">${s.totalCredits.toFixed(1)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">${m.metricTurns} <span class="habit-badge">${m.habitLabel}6</span></div>
            <div class="metric-value ${s.turnCount <= 10 ? 'good' : s.turnCount <= 20 ? 'warn' : 'bad'}">${s.turnCount}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">${m.metricContextOverflow} <span class="habit-badge">${m.habitLabel}6</span></div>
            <div class="metric-value ${s.hasContextOverflow ? 'bad' : 'good'}">${s.hasContextOverflow ? m.contextOverflowYes : m.contextOverflowNo}</div>
          </div>
        </div>
        <p class="habit1-note"><span class="habit-badge">${m.habitLabel}1</span> ${m.habit1Note}</p>
        <h4>${m.sectionIssues}</h4>
        ${issueHtml}
        <h4>${m.sectionInstructions} <span class="habit-badge">${m.habitLabel}3</span></h4>
        ${buildInstructionFilesTable(s, m)}
        <h4>${m.sectionTools} <span class="habit-badge">${m.habitLabel}5</span></h4>
        ${buildToolsTable(s, m)}
        <h4>${m.sectionCredits}</h4>
        <p style="font-size:10px;color:var(--vscode-descriptionForeground);margin:0 0 6px">${m.creditsNote}</p>
        ${buildCreditBreakdown(s, m)}
        <h4>${m.sectionLlm} <span class="habit-badge">${m.habitLabel}2</span> <span class="habit-badge">${m.habitLabel}3</span> <span class="habit-badge">${m.habitLabel}4</span> <span class="habit-badge">${m.habitLabel}5</span></h4>
        ${llmBreakdownHtml}
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Copilot Context Analyzer</title>
<style>
  body {
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 12px 16px;
  }
  h2 { margin: 0 0 12px; font-size: 16px; }
  h3 { margin: 8px 0; font-size: 14px; }
  h4 { margin: 12px 0 6px; font-size: 13px; color: var(--vscode-descriptionForeground); }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
  th {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    color: var(--vscode-descriptionForeground);
    font-weight: normal;
    white-space: nowrap;
  }
  td { padding: 5px 8px; border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c); }
  .session-row { cursor: pointer; }
  .session-row:hover td { background: var(--vscode-list-hoverBackground); }
  .session-row.high td:first-child { border-left: 3px solid #f44747; }
  .session-row.medium td:first-child { border-left: 3px solid #cca700; }
  .severity.high { color: #f44747; }
  .severity.medium { color: #cca700; }
  .severity.ok { color: #4ec9b0; }
  .detail-panel {
    background: var(--vscode-sideBar-background, #252526);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 12px;
    margin-bottom: 12px;
  }
  .detail-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
  .detail-header small { color: var(--vscode-descriptionForeground); font-size: 10px; }
  .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
  .metric-card {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 8px;
  }
  .metric-label { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
  .metric-value { font-size: 18px; font-weight: bold; }
  .metric-value.good { color: #4ec9b0; }
  .metric-value.warn { color: #cca700; }
  .metric-value.bad { color: #f44747; }
  .issue {
    border-left: 3px solid;
    padding: 8px 10px;
    margin-bottom: 8px;
    border-radius: 0 4px 4px 0;
    background: var(--vscode-editor-background);
  }
  .issue.high { border-color: #f44747; }
  .issue.medium { border-color: #cca700; }
  .issue.low { border-color: #4ec9b0; }
  .issue-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .habit-badge {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
  }
  .issue p { margin: 4px 0; font-size: 12px; color: var(--vscode-descriptionForeground); }
  .issue code { font-size: 11px; color: var(--vscode-textPreformat-foreground); }
  .no-issues { color: #4ec9b0; }
  .habit1-note { font-size: 11px; color: var(--vscode-descriptionForeground); margin: 0 0 8px; }
  details { margin-top: 8px; }
  details summary { cursor: pointer; font-size: 12px; color: var(--vscode-descriptionForeground); }
  details ul { margin: 4px 0; padding-left: 20px; font-size: 11px; }
  .credits { font-weight: bold; color: var(--vscode-charts-yellow, #cca700); }
  .cell-good { color: #4ec9b0; }
  .cell-warn  { color: #cca700; }
  .cell-bad   { color: #f44747; }
  .llm-table { font-size: 11px; }
  .llm-table th, .llm-table td { padding: 3px 6px; }
  .back-btn, .refresh-btn {
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    font-size: 12px;
    padding: 0;
  }
  .back-btn { margin-bottom: 8px; }
  .back-btn:hover, .refresh-btn:hover { text-decoration: underline; }
  .filter-bar { display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
  .filter-bar select {
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border);
    padding: 2px 6px;
    font-size: 11px;
    border-radius: 3px;
  }
  .summary-stats {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 6px;
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .summary-stats span { white-space: nowrap; }
  .summary-stats .stat-val { color: var(--vscode-foreground); font-weight: bold; }
  .source-badge {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    vertical-align: middle;
    font-weight: bold;
  }
  .source-badge.chat {
    background: #0e639c;
    color: #fff;
  }
  .source-badge.cli {
    background: #4b7f35;
    color: #fff;
  }
  .setup-card {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 8px 10px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .setup-card.ok { border-left: 3px solid #4ec9b0; }
  .setup-card.warn { border-left: 3px solid #cca700; }
  .setup-card-left { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
  .setup-card-icon { font-size: 14px; flex-shrink: 0; }
  .setup-card-text { font-size: 11px; }
  .setup-card-title { font-weight: bold; margin-bottom: 2px; }
  .setup-card-desc { color: var(--vscode-descriptionForeground); }
  .setup-btn {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 3px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .setup-btn:hover { background: var(--vscode-button-hoverBackground); }
  .chart-section { margin-bottom: 12px; }
  .chart-section h3 { margin: 0 0 6px; font-size: 13px; color: var(--vscode-descriptionForeground); }
  .chart-wrap { position: relative; width: 100%; overflow-x: auto; }
  .chart-wrap svg { display: block; }
  .chart-bar { fill: var(--vscode-charts-yellow, #cca700); opacity: 0.85; }
  .chart-bar:hover { opacity: 1; }
  .chart-axis { stroke: var(--vscode-panel-border, #3c3c3c); stroke-width: 1; }
  .chart-label { fill: var(--vscode-descriptionForeground); font-size: 9px; }
  .chart-grid { stroke: var(--vscode-panel-border, #3c3c3c); stroke-width: 1; stroke-dasharray: 3,3; }
  .chart-tooltip {
    position: absolute;
    background: var(--vscode-editorHoverWidget-background, #252526);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    padding: 4px 8px;
    font-size: 11px;
    pointer-events: none;
    display: none;
    white-space: nowrap;
  }
</style>
</head>
<body>
<div id="summary-view">
  ${buildSetupCards(setupStatus, m)}
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
    <h2 style="margin:0">${m.appTitle}</h2>
    <div style="display:flex;gap:8px">
      <button class="refresh-btn" onclick="toggleLocale()">🌐 ${locale.startsWith('ja') ? 'JA' : 'EN'}</button>
      <button class="refresh-btn" onclick="refresh()">↺ Refresh</button>
    </div>
  </div>
  <div class="filter-bar">
    <select id="filter-project" onchange="applyFilters()">
      <option value="">${m.allProjects}</option>
      ${[...new Set(sorted.map(s => s.projectName).filter(Boolean))].sort().map(p => `<option value="${p}">${p}</option>`).join('')}
    </select>
    <select id="filter-period" onchange="applyFilters()">
      <option value="0">${m.allPeriods}</option>
      <option value="7">${m.last7days}</option>
      <option value="30">${m.last30days}</option>
      <option value="90">${m.last90days}</option>
    </select>
    <select id="filter-source" onchange="applyFilters()">
      <option value="">${m.allSources}</option>
      <option value="chat">Chat</option>
      <option value="cli">CLI</option>
    </select>
  </div>
  <div id="summary-stats" class="summary-stats"></div>
  <div class="chart-section">
    <h3>${locale.startsWith('ja') ? '日別クレジット消費' : 'Daily Credit Usage'}</h3>
    <div class="chart-wrap">
      <svg id="daily-chart" width="100%" height="120"></svg>
      <div class="chart-tooltip" id="chart-tooltip"></div>
    </div>
  </div>
  <p style="font-size:11px;color:var(--vscode-descriptionForeground)">${m.clickToDetail}</p>
  <table id="session-table">
    <thead>
      <tr>
        <th>${m.colStartTime}</th>
        <th>${m.colProject}</th>
        <th>${m.colTitle}</th>
        <th>${m.colDuration}</th>
        <th>${m.colTurns}</th>
        <th>${m.colInput}</th>
        <th>${m.colCacheRate}</th>
        <th>${m.colToolUsage}</th>
        <th>${m.colCredits}</th>
        <th>${m.colEvaluation}</th>
      </tr>
    </thead>
    <tbody id="session-tbody">
      ${sessionRows}
    </tbody>
  </table>
</div>
<div id="detail-view" style="display:none">
  <button class="back-btn" onclick="showSummary()">${m.backToList}</button>
  ${detailSections}
</div>
<script>
  const vscode = acquireVsCodeApi();
  let currentSession = null;
  const ALL_SESSIONS = ${chartData};

  function refresh() { vscode.postMessage({ command: 'refresh' }); }
  function toggleLocale() { vscode.postMessage({ command: 'toggleLocale' }); }
  function enableChatLog() { vscode.postMessage({ command: 'enableChatLog' }); }
  function enableCliOtel() { vscode.postMessage({ command: 'enableCliOtel' }); }

  function renderChart(filteredSessions) {
    const svg = document.getElementById('daily-chart');
    if (!svg) return;
    const W = svg.getBoundingClientRect().width || 400;
    const H = 120;
    const PAD = { top: 8, right: 8, bottom: 28, left: 36 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const byDay = {};
    for (const s of filteredSessions) {
      byDay[s.d] = (byDay[s.d] || 0) + s.c;
    }
    const days = Object.keys(byDay).sort();
    if (days.length === 0) { svg.innerHTML = ''; return; }

    const maxVal = Math.max(...Object.values(byDay), 1);
    const barW = Math.max(4, Math.min(40, Math.floor(plotW / days.length) - 2));

    let bars = '', labels = '', grids = '';
    const gridCount = 4;
    for (let i = 0; i <= gridCount; i++) {
      const v = maxVal * i / gridCount;
      const y = PAD.top + plotH - (plotH * i / gridCount);
      grids += \`<line class="chart-grid" x1="\${PAD.left}" x2="\${W - PAD.right}" y1="\${y}" y2="\${y}"/>\`;
      grids += \`<text class="chart-label" x="\${PAD.left - 3}" y="\${y + 3}" text-anchor="end">\${v.toFixed(v < 10 ? 1 : 0)}</text>\`;
    }

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const val = byDay[day];
      const x = PAD.left + (i + 0.5) * (plotW / days.length) - barW / 2;
      const barH = Math.max(1, (val / maxVal) * plotH);
      const y = PAD.top + plotH - barH;
      bars += \`<rect class="chart-bar" x="\${x.toFixed(1)}" y="\${y.toFixed(1)}" width="\${barW}" height="\${barH.toFixed(1)}" data-day="\${day}" data-val="\${val.toFixed(2)}"/>\`;
      const showLabel = days.length <= 30 || i % Math.ceil(days.length / 15) === 0;
      if (showLabel) {
        const labelX = PAD.left + (i + 0.5) * (plotW / days.length);
        const shortDay = day.slice(5);
        labels += \`<text class="chart-label" x="\${labelX.toFixed(1)}" y="\${H - 6}" text-anchor="middle">\${shortDay}</text>\`;
      }
    }

    svg.setAttribute('height', H);
    svg.innerHTML = \`
      \${grids}
      <line class="chart-axis" x1="\${PAD.left}" x2="\${W - PAD.right}" y1="\${PAD.top + plotH}" y2="\${PAD.top + plotH}"/>
      \${bars}\${labels}\`;

    const tooltip = document.getElementById('chart-tooltip');
    svg.querySelectorAll('.chart-bar').forEach(bar => {
      bar.addEventListener('mouseenter', e => {
        tooltip.textContent = bar.dataset.day + ': ' + bar.dataset.val + ' credits';
        tooltip.style.display = 'block';
      });
      bar.addEventListener('mousemove', e => {
        const rect = svg.parentElement.getBoundingClientRect();
        tooltip.style.left = (e.clientX - rect.left + 10) + 'px';
        tooltip.style.top = (e.clientY - rect.top - 28) + 'px';
      });
      bar.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    });
  }

  function showDetail(sessionId) {
    currentSession = sessionId;
    document.getElementById('summary-view').style.display = 'none';
    document.getElementById('detail-view').style.display = 'block';
    document.querySelectorAll('.detail-panel').forEach(p => p.style.display = 'none');
    const target = document.getElementById('detail-' + sessionId);
    if (target) target.style.display = 'block';
  }

  function showSummary() {
    document.getElementById('summary-view').style.display = 'block';
    document.getElementById('detail-view').style.display = 'none';
  }

  function applyFilters() {
    const project = document.getElementById('filter-project').value;
    const days = parseInt(document.getElementById('filter-period').value);
    const source = document.getElementById('filter-source').value;
    const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;
    const rows = document.querySelectorAll('#session-tbody .session-row');
    let visible = 0, totalCredits = 0, totalInput = 0, cacheSum = 0, cacheCount = 0;
    rows.forEach(row => {
      const rowProject = row.dataset.project || '';
      const rowTs = parseInt(row.dataset.ts || '0');
      const rowSource = row.dataset.source || '';
      const show = (!project || rowProject === project) && (!cutoff || rowTs >= cutoff) && (!source || rowSource === source);
      row.style.display = show ? '' : 'none';
      if (show) {
        visible++;
        const cells = row.querySelectorAll('td');
        const credits = parseFloat(cells[8]?.textContent || '0') || 0;
        const inputK = parseFloat(cells[5]?.textContent || '0') || 0;
        const cacheStr = cells[6]?.textContent || '';
        const cacheVal = parseFloat(cacheStr);
        totalCredits += credits;
        totalInput += inputK;
        if (!isNaN(cacheVal)) { cacheSum += cacheVal; cacheCount++; }
      }
    });
    const avgCache = cacheCount > 0 ? (cacheSum / cacheCount).toFixed(0) : '-';
    document.getElementById('summary-stats').innerHTML =
      '<span>${m.showing}: <span class="stat-val">' + visible + '${m.sessions}</span></span>' +
      '<span>${m.totalCredits}: <span class="stat-val" style="color:var(--vscode-charts-yellow,#cca700)">' + totalCredits.toFixed(1) + '</span></span>' +
      '<span>${m.totalInput}: <span class="stat-val">' + totalInput.toFixed(1) + 'K</span></span>' +
      '<span>${m.avgCacheRate}: <span class="stat-val">' + avgCache + '%</span></span>';

    const filtered = ALL_SESSIONS.filter(s =>
      (!project || s.p === project) &&
      (!cutoff || s.ts >= cutoff) &&
      (!source || s.src === source)
    );
    renderChart(filtered);
  }

  // initialize on load
  applyFilters();
  window.addEventListener('resize', () => {
    const project = document.getElementById('filter-project').value;
    const days = parseInt(document.getElementById('filter-period').value);
    const source = document.getElementById('filter-source').value;
    const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;
    const filtered = ALL_SESSIONS.filter(s =>
      (!project || s.p === project) &&
      (!cutoff || s.ts >= cutoff) &&
      (!source || s.src === source)
    );
    renderChart(filtered);
  });
</script>
</body>
</html>`;
}

function buildInstructionFilesTable(s: SessionAnalysis, m: Messages): string {
  if (s.instructionFiles.length === 0) {
    return `<p style="font-size:11px;color:var(--vscode-descriptionForeground)">${m.instructionNoFiles}</p>`;
  }
  const searchedIn = s.instructionFiles[0]?.searchedIn;
  const searchNote = searchedIn
    ? `<p style="font-size:10px;color:var(--vscode-descriptionForeground);margin:0 0 4px">${m.instructionSearchedIn}: <code>${searchedIn}</code></p>`
    : `<p style="font-size:10px;color:var(--vscode-descriptionForeground);margin:0 0 4px">${m.instructionNoWorkspace}</p>`;

  const rows = s.instructionFiles.map(f => {
    if (!f.exists) {
      return `<tr>
        <td>${f.name}</td>
        <td colspan="2" style="color:var(--vscode-descriptionForeground)">${m.instructionNotFound}</td>
      </tr>`;
    }
    const lineClass = f.lines > 200 ? 'bad' : f.lines > 100 ? 'warn' : 'good';
    return `<tr>
      <td title="${f.filePath ?? ''}">${f.name}</td>
      <td style="text-align:right" class="cell-${lineClass}">${f.lines}</td>
      <td style="text-align:right">${(f.approxTokens / 1000).toFixed(1)}K</td>
    </tr>`;
  }).join('');
  return `${searchNote}
  <table class="llm-table">
    <thead><tr><th>${m.instructionColFile}</th><th style="text-align:right">${m.instructionColLines}</th><th style="text-align:right">${m.instructionColTokens}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="font-size:10px;color:var(--vscode-descriptionForeground)">${m.instructionNote}</p>`;
}

function buildToolsTable(s: SessionAnalysis, m: Messages): string {
  if (s.toolCallNames.length === 0 && s.unusedTools.length === 0) {
    return `<p style="font-size:11px;color:var(--vscode-descriptionForeground)">${m.toolsNoInfo}</p>`;
  }
  const usedHtml = s.toolCallNames.length === 0
    ? `<p style="font-size:11px;margin:4px 0">${m.toolsNone}</p>`
    : `<ul>${[...s.toolCallNames].sort().map(t => `<li>${t}</li>`).join('')}</ul>`;
  const unusedHtml = s.unusedTools.length === 0
    ? `<p style="font-size:11px;margin:4px 0">${m.toolsNone}</p>`
    : `<ul>${[...s.unusedTools].sort().map(t => `<li>${t}</li>`).join('')}</ul>`;
  return `
    <details>
      <summary class="cell-good">${m.toolsUsed(s.toolCallNames.length)}</summary>
      ${usedHtml}
    </details>
    <details>
      <summary class="cell-bad">${m.toolsUnused(s.unusedTools.length)}</summary>
      ${unusedHtml}
    </details>`;
}

function buildCreditBreakdown(s: SessionAnalysis, m: Messages): string {
  if (s.creditBreakdown.length === 0) {
    return `<p style="font-size:11px;color:var(--vscode-descriptionForeground)">${m.creditNoInfo}</p>`;
  }
  const rows = s.creditBreakdown.map(c => `
    <tr>
      <td>${c.modelName}</td>
      <td style="text-align:right">${c.requestCount}</td>
      <td style="text-align:right">×${c.multiplier}</td>
      <td style="text-align:right;font-weight:bold">${c.credits.toFixed(1)}</td>
    </tr>`).join('');
  return `<table class="llm-table">
    <thead><tr><th>${m.creditColModel}</th><th style="text-align:right">${m.creditColRequests}</th><th style="text-align:right">${m.creditColMultiplier}</th><th style="text-align:right">${m.creditColCredits}</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="3" style="text-align:right;color:var(--vscode-descriptionForeground)">${m.creditTotal}</td>
      <td style="text-align:right;font-weight:bold;color:var(--vscode-charts-yellow,#cca700)">${s.totalCredits.toFixed(1)}</td>
    </tr></tfoot>
  </table>`;
}

function buildLlmBreakdown(s: SessionAnalysis, m: Messages): string {
  const rows = s.llmRequests.map(r => {
    const cacheRate = (r.attrs.inputTokens ?? 0) > 0
      ? ((r.attrs.cachedTokens ?? 0) / (r.attrs.inputTokens ?? 1) * 100).toFixed(0)
      : '-';
    return `<tr>
      <td>${r.attrs.debugName ?? '-'}</td>
      <td>${r.attrs.model}</td>
      <td>${((r.attrs.inputTokens ?? 0) / 1000).toFixed(1)}K</td>
      <td>${((r.attrs.outputTokens ?? 0) / 1000).toFixed(1)}K</td>
      <td>${cacheRate}%</td>
    </tr>`;
  }).join('');

  return `<table class="llm-table">
    <thead><tr><th>${m.llmColPurpose}</th><th>${m.llmColModel}</th><th>${m.llmColInput}</th><th>${m.llmColOutput}</th><th>${m.llmColCacheRate}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildSetupCards(status: SetupStatus, m: Messages): string {
  const cards: string[] = [];

  if (!status.chatEnabled) {
    cards.push(`
      <div class="setup-card warn">
        <div class="setup-card-left">
          <span class="setup-card-icon">💬</span>
          <div class="setup-card-text">
            <div class="setup-card-title">Copilot Chat</div>
            <div class="setup-card-desc">${m.setupChatDesc}</div>
          </div>
        </div>
        <button class="setup-btn" onclick="enableChatLog()">${m.setupEnable}</button>
      </div>`);
  }

  if (!status.cliConfigured) {
    cards.push(`
      <div class="setup-card warn">
        <div class="setup-card-left">
          <span class="setup-card-icon">⌨</span>
          <div class="setup-card-text">
            <div class="setup-card-title">Copilot CLI</div>
            <div class="setup-card-desc">${m.setupCliDesc}</div>
          </div>
        </div>
        <button class="setup-btn" onclick="enableCliOtel()">${m.setupEnable}</button>
      </div>`);
  }

  return cards.join('');
}
