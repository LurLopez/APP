const fileInput = document.querySelector('#file-input');
const dropzone = document.querySelector('#dropzone');
const selectFileButton = document.querySelector('#select-file');
const removeFileButton = document.querySelector('#remove-file');
const filePreview = document.querySelector('#file-preview');
const fileName = document.querySelector('#file-name');
const fileSize = document.querySelector('#file-size');
const analyzeButton = document.querySelector('#analyze-button');
const uploadForm = document.querySelector('#upload-form');
const processingPanel = document.querySelector('#processing-panel');
const resultPreview = document.querySelector('#result-preview');
const progressBar = document.querySelector('#progress-bar');
const processingTitle = document.querySelector('#processing-title');
const processingTime = document.querySelector('#processing-time');
const toast = document.querySelector('#toast');
const sidebar = document.querySelector('#sidebar');
const menuToggle = document.querySelector('#menu-toggle');
const backdrop = document.querySelector('#backdrop');
const appShell = document.querySelector('.app-shell');
const tickerSearch = document.querySelector('#ticker-search');
const searchResults = document.querySelector('#search-results');

let selectedFile = null;
let toastTimer;
let analysisTimer;
let lastAnalysisFailed = true;
let currentPdfUrl = null;
let currentPdfName = 'analisis-cifra.pdf';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderNotes(notes) {
  const list = (Array.isArray(notes) ? notes : []).filter(Boolean);
  if (!list.length) return '';
  return `<ul class="report-notes">${list.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`;
}

function renderTable(headers, rows) {
  const thead = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const tbody = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell ?? '—')}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
}

function renderHorizon(horizon) {
  const label = escapeHtml(horizon.label ?? 'Periodo');
  let html = `<div class="report-block"><h5>${label}</h5>`;

  const sales = horizon.sales ?? {};
  if (Array.isArray(sales.rows) && sales.rows.length) {
    html += `<p class="report-extras">1. VENTAS</p>`;
    html += renderTable(
      ['Métrica', 'Ajustado', 'Anterior Aj.', '% Aj.', 'Normal', 'Anterior N.', '% N.'],
      sales.rows.map((row) => [row.name, row.adjusted, row.prevAdjusted, row.pctAdjusted, row.normal, row.prevNormal, row.pctNormal]),
    );
    const extras = [];
    if (sales.shares) extras.push(`ACCIONES: ${escapeHtml(sales.shares)}`);
    if (sales.eps) extras.push(`BPA: ${escapeHtml(sales.eps)}`);
    if (extras.length) html += `<p class="report-extras">${extras.join(' · ')}</p>`;
    html += renderNotes(sales.notes);
  }

  const cashFlow = horizon.cashFlow ?? {};
  if (Array.isArray(cashFlow.rows) && cashFlow.rows.length) {
    html += `<p class="report-extras">2. CASH FLOW</p>`;
    const scenarios = Array.isArray(cashFlow.scenarios) && cashFlow.scenarios.length ? cashFlow.scenarios : ['Valor'];
    html += renderTable(
      ['Métrica', ...scenarios],
      cashFlow.rows.map((row) => [row.name, ...(Array.isArray(row.values) && row.values.length ? row.values : [row.value])]),
    );
    html += renderNotes(cashFlow.notes);
  }

  const capital = horizon.capital ?? {};
  if (Array.isArray(capital.rows) && capital.rows.length) {
    html += `<p class="report-extras">3. ASIGNACIÓN DE CAPITAL</p>`;
    html += renderTable(
      ['Métrica', 'Valor'],
      capital.rows.map((row) => [row.name, row.value]),
    );
    if (capital.verification) html += `<p class="report-extras">${escapeHtml(capital.verification)}</p>`;
    html += renderNotes(capital.notes);
  }

  html += '</div>';
  return html;
}

function renderReport(report) {
  const horizons = Array.isArray(report.horizons) ? report.horizons : [];
  const titleParts = [report.ticker, report.periodTitle].filter(Boolean);
  document.querySelector('#result-title').textContent = titleParts.length ? titleParts.join(' — ') : 'Informe generado';
  document.querySelector('#report-body').innerHTML = `
    ${horizons.map(renderHorizon).join('')}
    <p class="report-hint">El PDF descargable incluye los bloques completos en los dos horizontes.</p>
  `;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setFile(file) {
  if (!file) return;

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    showToast('Selecciona un archivo PDF para continuar.');
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    showToast('El archivo supera el límite de 25 MB.');
    return;
  }

  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);
  dropzone.hidden = true;
  filePreview.hidden = false;
  analyzeButton.disabled = false;
}

function clearFile() {
  selectedFile = null;
  fileInput.value = '';
  dropzone.hidden = false;
  filePreview.hidden = true;
  analyzeButton.disabled = true;
}

function setAgentState(agent, state) {
  const row = document.querySelector(`[data-agent="${agent}"]`);
  if (!row) return;

  row.classList.remove('active', 'done', 'error');
  const stateLabel = row.querySelector('.agent-state');
  if (state === 'active') {
    row.classList.add('active');
    stateLabel.textContent = 'Procesando';
  }
  if (state === 'done') {
    row.classList.add('done');
    stateLabel.textContent = 'Completado';
  }
  if (state === 'error') {
    row.classList.add('error');
    stateLabel.textContent = 'Error';
  }
}

function resetAgentStates() {
  ['origin', 'sector', 'analyst'].forEach((agent) => {
    const row = document.querySelector(`[data-agent="${agent}"]`);
    row.classList.remove('active', 'done', 'error');
    row.querySelector('.agent-state').textContent = 'En espera';
  });
}

function showAnalysisError(message, failedAgent = 'origin') {
  lastAnalysisFailed = true;
  if (failedAgent === 'sector') setAgentState('origin', 'done');
  setAgentState(failedAgent, 'error');
  const errorBox = document.querySelector('#analysis-error');
  errorBox.textContent = message;
  errorBox.hidden = false;
  const retryButton = document.querySelector('#retry-analysis');
  retryButton.textContent = 'Reintentar';
  retryButton.hidden = false;
  document.querySelector('#processing-note').hidden = true;
  processingTitle.textContent = failedAgent === 'sector'
    ? 'La empresa no es de consumo defensivo'
    : failedAgent === 'analyst'
      ? 'No se pudo generar el análisis'
      : 'No se pudo verificar el documento';
  progressBar.style.width = '100%';
  clearInterval(analysisTimer);
}

async function runRealAnalysis() {
  clearInterval(analysisTimer);
  let seconds = 1;

  processingPanel.hidden = false;
  resultPreview.hidden = true;
  uploadForm.hidden = true;
  resetAgentStates();
  document.querySelector('#analysis-error').hidden = true;
  document.querySelector('#retry-analysis').hidden = true;
  document.querySelector('#processing-note').hidden = false;
  progressBar.style.width = '20%';
  processingTitle.textContent = 'Verificando el documento...';
  processingTime.textContent = '00:01';
  setAgentState('origin', 'active');

  analysisTimer = setInterval(() => {
    seconds += 1;
    processingTime.textContent = `00:${String(seconds).padStart(2, '0')}`;
  }, 1000);

  const formData = new FormData();
  formData.append('file', selectedFile);

  try {
    const response = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const failedAgent = data.code === 'NOT_DEFENSIVE_CONSUMER' ? 'sector'
        : data.code === 'INVALID_MODEL_RESPONSE' || data.code === 'INVALID_REPORT_STRUCTURE' ? 'analyst'
          : 'origin';
      showAnalysisError(data.error || 'No se pudo analizar el documento. Inténtalo de nuevo.', failedAgent);
      return;
    }

    setAgentState('origin', 'done');
    setAgentState('sector', 'done');
    setAgentState('analyst', 'done');
    lastAnalysisFailed = false;
    progressBar.style.width = '100%';
    processingTitle.textContent = 'Análisis completado: PDF generado';
    clearInterval(analysisTimer);
    const retryButton = document.querySelector('#retry-analysis');
    retryButton.textContent = 'Analizar otro informe';
    retryButton.hidden = false;
    currentPdfUrl = data.pdfUrl ?? null;
    const ticker = data.report?.ticker;
    currentPdfName = `${ticker ? `${String(ticker).toLowerCase()}-` : ''}analisis-cifra.pdf`;
    renderReport(data.report ?? {});
    resultPreview.hidden = false;
    showToast(`${data.formType} de consumo defensivo analizado. El PDF con los 3 bloques está listo para descargar.`);
  } catch {
    showAnalysisError('No se pudo conectar con el servidor. Comprueba que esté en marcha.');
  }
}

selectFileButton.addEventListener('click', (event) => {
  event.stopPropagation();
  fileInput.click();
});

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener('change', (event) => setFile(event.target.files[0]));
removeFileButton.addEventListener('click', clearFile);

['dragenter', 'dragover'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add('dragging');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragging');
  });
});

dropzone.addEventListener('drop', (event) => setFile(event.dataTransfer.files[0]));

uploadForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!selectedFile) return;
  runRealAnalysis();
});

document.querySelector('#retry-analysis').addEventListener('click', () => {
  processingPanel.hidden = true;
  uploadForm.hidden = false;
  if (!lastAnalysisFailed) clearFile();
});

document.querySelector('#report-download').addEventListener('click', () => {
  if (!currentPdfUrl) return;
  const link = document.createElement('a');
  link.href = currentPdfUrl;
  link.download = currentPdfName;
  document.body.appendChild(link);
  link.click();
  link.remove();
});

document.querySelector('#new-analysis').addEventListener('click', () => {
  resultPreview.hidden = true;
  uploadForm.hidden = false;
  clearFile();
  document.querySelector('#nuevo').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

menuToggle.addEventListener('click', () => {
  if (window.matchMedia('(max-width: 900px)').matches) {
    const isOpen = sidebar.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    backdrop.classList.toggle('visible', isOpen);
    return;
  }

  const isCollapsed = appShell.classList.toggle('sidebar-collapsed');
  menuToggle.setAttribute('aria-expanded', String(!isCollapsed));
});

backdrop.addEventListener('click', closeSidebar);

function closeSidebar() {
  sidebar.classList.remove('open');
  backdrop.classList.remove('visible');
  menuToggle.setAttribute('aria-expanded', 'false');
}

document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach((item) => item.classList.remove('active'));
    link.classList.add('active');
    closeSidebar();
  });
});

document.querySelectorAll('.row-action').forEach((button) => {
  button.addEventListener('click', () => showToast('La vista de detalle se conectará al histórico de análisis.'));
});

const screenerSearchInput = document.querySelector('#screener-search-input');
const screenerSearchButton = document.querySelector('#screener-search-button');
const screenerResult = document.querySelector('#screener-result');
const screenerError = document.querySelector('#screener-error');
const screenerLoading = document.querySelector('#screener-loading');

let screenerSeries = 'quarterly';
let screenerStatement = 'income';
let screenerData = null;
let screenerAuthenticated = false;
let screenerCurrentTicker = null;
let searchDebounceTimer;
let screenerPrecision = 2;
let screenerHideEmpty = false;

async function searchCompanies(query) {
  const response = await fetch(`/api/screener/search?q=${encodeURIComponent(query.trim())}`);
  if (!response.ok) return [];
  const data = await response.json().catch(() => null);
  return data?.companies ?? [];
}

function renderSearchResults(query) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(async () => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      searchResults.hidden = true;
      searchResults.innerHTML = '';
      return;
    }

    const matches = await searchCompanies(query);
    if (!matches.length) {
      searchResults.innerHTML = '<div class="search-empty">Sin resultados en EDGAR para esta búsqueda.</div>';
      searchResults.hidden = false;
      return;
    }

    searchResults.innerHTML = matches.map((company) => `
      <button class="search-result" type="button" data-ticker="${escapeHtml(company.ticker)}">
        <span>${escapeHtml(company.name)}</span><strong>${escapeHtml(company.ticker)}</strong>
      </button>
    `).join('');
    searchResults.hidden = false;

    searchResults.querySelectorAll('.search-result').forEach((result) => {
      result.addEventListener('click', () => {
        const ticker = result.dataset.ticker;
        searchResults.hidden = true;
        tickerSearch.value = ticker;
        loadCompanyToScreener(ticker);
      });
    });
  }, 250);
}

function formatMoneyUsd(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const num = Number(value) / 1e6;
  const formatter = new Intl.NumberFormat('es-ES', { minimumFractionDigits: screenerPrecision, maximumFractionDigits: screenerPrecision });
  const formatted = formatter.format(Math.abs(num));
  return num < 0 ? `(${formatted})` : formatted;
}

function formatEps(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const formatter = new Intl.NumberFormat('es-ES', { minimumFractionDigits: screenerPrecision, maximumFractionDigits: screenerPrecision });
  return `${formatter.format(Number(value))} $`;
}

function formatShares(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const formatter = new Intl.NumberFormat('es-ES', { minimumFractionDigits: screenerPrecision, maximumFractionDigits: screenerPrecision });
  return formatter.format(Number(value) / 1e6);
}

function periodLabel(period) {
  if (!period) return '—';
  if (/^\d{4}$/.test(period)) return `${period} (FY)`;
  const [year, quarter] = period.split('-Q');
  return `Q${quarter} ${year}`;
}

function periodDateLabel(row) {
  if (!row?.periodEnd) return periodLabel(row?.period);
  const date = new Date(`${row.periodEnd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return periodLabel(row.period);
  return `${date.getUTCDate()}/${date.getUTCMonth() + 1}/${String(date.getUTCFullYear()).slice(-2)}`;
}

function formatPercentage(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  const formatter = new Intl.NumberFormat('es-ES', { minimumFractionDigits: screenerPrecision === 0 ? 0 : 1, maximumFractionDigits: screenerPrecision === 0 ? 0 : 1 });
  return `${num < 0 ? `(${formatter.format(Math.abs(num))})` : formatter.format(num)} %`;
}

function derivedScreenerValue(item, row, rowIndex, rows) {
  if (item.kind !== 'change' && item.kind !== 'margin') return row.values?.[item.key];
  const value = row.values?.[item.baseKey];
  if (item.kind === 'margin') {
    const revenue = row.values?.revenue;
    return revenue ? (Number(value) / Number(revenue)) * 100 : null;
  }
  const previousIndex = screenerSeries === 'quarterly' ? rowIndex - 4 : rowIndex - 1;
  const previous = rows[previousIndex]?.values?.[item.baseKey];
  return previous ? ((Number(value) / Number(previous)) - 1) * 100 : null;
}

function formatScreenerValue(value, format, kind) {
  if (kind === 'change' || kind === 'margin') return formatPercentage(value);
  if (format === 'perShare') return formatEps(value);
  if (format === 'shares') return formatShares(value);
  return formatMoneyUsd(value);
}

function isLockedPeriod(rowIndex, rows) {
  if (screenerAuthenticated) return false;
  return rowIndex < Math.max(0, rows.length - 4);
}

function renderProCell() {
  return '<span class="pro-pill"><i aria-hidden="true"></i>PRO</span>';
}

function renderStatementTable(rows, items) {
  const table = document.querySelector('#screener-statement-table');
  const title = document.querySelector('#screener-table-title').textContent;
  table.querySelector('thead').innerHTML = `<tr><th class="sticky-col">${escapeHtml(title)}</th>${rows.map((row) => `<th>${periodDateLabel(row)}</th>`).join('')}</tr>`;
  table.querySelector('tbody').innerHTML = items.map((item) => {
    if (item.kind === 'section') return `<tr class="section-row"><td class="sticky-col" colspan="${rows.length + 1}">${escapeHtml(item.label)}</td></tr>`;
    if (item.kind === 'note') return `<tr class="note-row"><td class="sticky-col" colspan="${rows.length + 1}">${escapeHtml(item.label)}</td></tr>`;
    const cells = rows.map((row, rowIndex) => isLockedPeriod(rowIndex, rows)
      ? renderProCell()
      : formatScreenerValue(derivedScreenerValue(item, row, rowIndex, rows), item.format, item.kind));
    const rowClass = [item.emphasis ? 'emphasis-row' : '', item.kind === 'change' || item.kind === 'margin' ? 'derived-row' : ''].filter(Boolean).join(' ');
    return `<tr${rowClass ? ` class="${rowClass}"` : ''} data-metric="${escapeHtml(item.label)}"><td class="sticky-col">${escapeHtml(item.label)}</td>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
  }).join('');
  table.querySelectorAll('tbody tr[data-metric]').forEach((row) => row.addEventListener('click', () => showToast(`Gráfico de ${row.dataset.metric}: disponible próximamente.`)));
}

function renderScreenerTables() {
  if (!screenerData) return;
  const rows = [...(screenerData[screenerSeries] ?? [])].reverse();
  const statements = screenerData.statements ?? {};
  const title = document.querySelector('#screener-table-title');
  const statementNames = { income: 'Cuenta de resultados', balance: 'Balance de situación', cashflow: 'Estado de Flujo de Efectivo' };
  title.textContent = `${statementNames[screenerStatement] ?? 'Estado financiero'} | Cifra`;
  const range = document.querySelector('#screener-period-range');
  range.textContent = rows.length ? `Datos financieros de ${periodDateLabel(rows[rows.length - 1])} a ${periodDateLabel(rows[0])}` : 'Sin periodos disponibles';
  const items = statements[screenerStatement] ?? [];
  const visibleItems = screenerHideEmpty
    ? items.filter((item) => item.kind || rows.some((row, rowIndex) => {
      const value = derivedScreenerValue(item, row, rowIndex, rows);
      return value !== null && value !== undefined;
    }))
    : items;
  renderStatementTable(rows, visibleItems);
}

function renderScreener(data) {
  screenerData = data;
  screenerAuthenticated = data.authenticated === true;
  document.querySelector('#screener-company-name').innerHTML = `${escapeHtml(data.company.name)} <span class="ticker-chip">${escapeHtml(data.company.ticker)}</span>`;
  document.querySelector('#screener-company-meta').textContent = `CIK ${data.company.cik} · Moneda USD · Fuente: SEC EDGAR`;
  renderScreenerTables();
}

async function refreshScreenerCompany() {
  if (!screenerCurrentTicker) return;
  try {
    const response = await fetch(`/api/screener/company/${encodeURIComponent(screenerCurrentTicker)}`);
    const data = await response.json().catch(() => ({}));
    if (response.ok) renderScreener(data);
  } catch {
    // Se mantienen los datos actuales si la consulta falla.
  }
}

async function loadCompanyToScreener(ticker) {
  searchResults.hidden = true;
  tickerSearch.value = ticker;
  screenerCurrentTicker = ticker.toUpperCase();
  screenerResult.hidden = true;
  screenerError.hidden = true;
  screenerLoading.hidden = false;
  document.querySelector('#screener').scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const response = await fetch(`/api/screener/company/${encodeURIComponent(ticker)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      screenerError.textContent = data.error || 'No se pudo consultar la empresa.';
      screenerError.hidden = false;
      return;
    }
    renderScreener(data);
    screenerResult.hidden = false;
  } catch {
    screenerError.textContent = 'No se pudo conectar con el servidor. Comprueba que esté en marcha.';
    screenerError.hidden = false;
  } finally {
    screenerLoading.hidden = true;
  }
}

async function submitScreenerSearch() {
  const query = screenerSearchInput.value.trim();
  if (!query) return;
  if (/^[A-Z0-9.-]{1,10}$/i.test(query)) {
    loadCompanyToScreener(query);
    return;
  }
  const companies = await searchCompanies(query);
  if (!companies.length) {
    screenerError.textContent = 'Sin resultados en EDGAR para esta búsqueda.';
    screenerError.hidden = false;
    return;
  }
  loadCompanyToScreener(companies[0].ticker);
}

screenerSearchButton.addEventListener('click', submitScreenerSearch);
screenerSearchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    submitScreenerSearch();
  }
});

document.querySelectorAll('.screener-period-toggle button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.screener-period-toggle button').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    screenerSeries = button.dataset.series;
    renderScreenerTables();
  });
});

document.querySelectorAll('.screener-tab').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.classList.contains('screener-tab-disabled')) {
      showToast('Esta vista estará disponible próximamente.');
      return;
    }
    document.querySelectorAll('.screener-tab').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    screenerStatement = button.dataset.statement;
    renderScreenerTables();
  });
});

document.querySelectorAll('[data-precision]').forEach((button) => {
  button.addEventListener('click', () => {
    screenerPrecision = Number(button.dataset.precision);
    document.querySelectorAll('[data-precision]').forEach((item) => item.classList.toggle('active', item === button));
    renderScreenerTables();
  });
});

document.querySelector('[data-table-action="transpose"]').addEventListener('click', () => {
  document.querySelector('#screener-statement-table').classList.toggle('table-compact');
});

document.querySelector('[data-table-action="empty"]').addEventListener('click', (event) => {
  screenerHideEmpty = !screenerHideEmpty;
  event.currentTarget.classList.toggle('active');
  renderScreenerTables();
});

document.querySelector('.screener-advice-close').addEventListener('click', () => {
  document.querySelector('#screener-advice').hidden = true;
});

window.addEventListener('auth:change', (event) => {
  screenerAuthenticated = Boolean(event.detail?.user);
  if (screenerCurrentTicker) refreshScreenerCompany();
});

tickerSearch.addEventListener('input', (event) => renderSearchResults(event.target.value));
tickerSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    searchResults.hidden = true;
    tickerSearch.blur();
  }
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.search-wrap')) searchResults.hidden = true;
});
