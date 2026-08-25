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
const tickerSearch = document.querySelector('#ticker-search');
const searchResults = document.querySelector('#search-results');

let selectedFile = null;
let toastTimer;
let analysisTimer;
let lastAnalysisFailed = true;
let currentPdfUrl = null;
let currentPdfName = 'analisis-cifra.pdf';
let searchDebounceTimer;
let pendingFiling = null;
let currentUser = null;

let processingHintTimer;

function formatElapsed(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function startProcessingHints() {
  clearTimeout(processingHintTimer);
  const hints = [
    [45000, 'El análisis sigue en curso. Suele tardar entre 1 y 4 minutos.'],
    [240000, 'Esto está tardando más de lo habitual. Si no responde pronto, verás un mensaje de error claro para reintentar.'],
  ];
  hints.forEach(([delay, message]) => {
    processingHintTimer = setTimeout(() => {
      if (processingPanel.hidden) return;
      if (!document.querySelector('#analysis-error').hidden) return;
      document.querySelector('#processing-note').textContent = message;
    }, delay);
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

function goToCompany(ticker) {
  window.location.href = `/empresa/${encodeURIComponent(ticker)}`;
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
  clearTimeout(processingHintTimer);
  if (failedAgent === 'sector') setAgentState('origin', 'done');
  if (failedAgent === 'analyst') {
    setAgentState('origin', 'done');
    setAgentState('sector', 'done');
  }
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

function startAnalysisUi(title) {
  clearInterval(analysisTimer);
  clearTimeout(processingHintTimer);
  let seconds = 1;

  processingPanel.hidden = false;
  resultPreview.hidden = true;
  uploadForm.hidden = true;
  resetAgentStates();
  document.querySelector('#analysis-error').hidden = true;
  document.querySelector('#retry-analysis').hidden = true;
  document.querySelector('#processing-note').hidden = false;
  document.querySelector('#processing-note').textContent = 'El documento se verifica automáticamente antes de continuar.';
  progressBar.style.width = '20%';
  processingTitle.textContent = title;
  processingTime.textContent = '00:01';
  setAgentState('origin', 'active');

  analysisTimer = setInterval(() => {
    seconds += 1;
    processingTime.textContent = formatElapsed(seconds);
  }, 1000);
}

function failAnalysis(data) {
  const failedAgent = data.code === 'NOT_DEFENSIVE_CONSUMER' ? 'sector'
    : data.code === 'INVALID_MODEL_RESPONSE' || data.code === 'INVALID_REPORT_STRUCTURE' ? 'analyst'
      : 'origin';
  showAnalysisError(data.error || 'No se pudo analizar el documento. Inténtalo de nuevo.', failedAgent);
}

function finishAnalysis(data) {
  clearTimeout(processingHintTimer);
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
  const saved = data.saved && currentUser;
  showToast(`${saved ? 'Análisis guardado en tu histórico. ' : ''}${data.formType} de consumo defensivo analizado. El PDF con los 3 bloques está listo para descargar.`);
  if (saved) fetchAnalyses();
}

async function runRealAnalysis() {
  pendingFiling = null;
  startAnalysisUi('Verificando el documento...');
  startProcessingHints();

  const formData = new FormData();
  formData.append('file', selectedFile);

  try {
    const response = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      failAnalysis(data);
      return;
    }

    finishAnalysis(data);
  } catch {
    showAnalysisError('No se pudo conectar con el servidor. Comprueba que esté en marcha.');
  }
}

async function runFilingAnalysis(ticker, accession) {
  pendingFiling = { ticker, accession };
  startAnalysisUi(`Analizando el informe de ${ticker}…`);
  document.querySelector('#processing-note').textContent = 'Informe de la sección de informes de SEC EDGAR. Mismo proceso de verificación que en la subida manual.';
  startProcessingHints();

  try {
    const response = await fetch(
      `/api/screener/company/${encodeURIComponent(ticker)}/filings/${encodeURIComponent(accession)}/analyze`,
      { method: 'POST' },
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      failAnalysis(data);
      return;
    }

    finishAnalysis(data);
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
  if (pendingFiling) {
    runFilingAnalysis(pendingFiling.ticker, pendingFiling.accession);
    return;
  }
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

/* ── Historial de análisis ─────────────────────────────────── */

const historyBody = document.querySelector('#history-body');
const historyFilters = document.querySelector('#history-filters');
const historyCompanyInput = document.querySelector('#history-company');
const historyFromInput = document.querySelector('#history-from');
const historyToInput = document.querySelector('#history-to');
const historyEmpty = document.querySelector('#history-empty');
const historyEmptyText = document.querySelector('#history-empty-text');
const historyLoginButton = document.querySelector('#history-login');
let historyDebounceTimer;

function formatHistoryDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function historyQuery() {
  const dateType = document.querySelector('input[name="history-date-type"]:checked')?.value ?? 'period';
  const params = new URLSearchParams();
  const ticker = historyCompanyInput.value.trim();
  if (ticker) params.set('ticker', ticker);
  if (historyFromInput.value) params.set(dateType === 'period' ? 'periodFrom' : 'createdFrom', historyFromInput.value);
  if (historyToInput.value) params.set(dateType === 'period' ? 'periodTo' : 'createdTo', historyToInput.value);
  return params;
}

function renderHistory(analyses) {
  const list = Array.isArray(analyses) ? analyses : [];

  if (!currentUser) {
    historyFilters.hidden = true;
    historyBody.innerHTML = '';
    historyEmpty.hidden = false;
    historyEmptyText.textContent = 'Inicia sesión para guardar tus análisis y consultarlos aquí.';
    historyLoginButton.hidden = false;
    return;
  }

  historyLoginButton.hidden = true;
  historyFilters.hidden = false;

  if (!list.length) {
    historyBody.innerHTML = '';
    historyEmpty.hidden = false;
    historyEmptyText.textContent = historyCompanyInput.value || historyFromInput.value || historyToInput.value
      ? 'No hay análisis que coincidan con los filtros.'
      : 'Aún no tienes análisis guardados. Sube un 10-Q o 10-K y aparecerá aquí.';
    return;
  }

  historyEmpty.hidden = true;
  historyBody.innerHTML = list.map((analysis) => {
    const ticker = String(analysis.ticker ?? '').toUpperCase();
    const company = analysis.companyName || ticker || '—';
    const periodTitle = analysis.periodTitle || '—';
    const status = analysis.status === 'done'
      ? '<span class="table-status done"><i></i> Completado</span>'
      : `<span class="table-status warning"><i></i> ${escapeHtml(analysis.status === 'processing' ? 'Procesando' : 'Error')}</span>`;
    return `
      <tr data-pdf-url="${escapeHtml(analysis.pdf_url ?? '')}" tabindex="0">
        <td><span class="table-file">PDF</span><strong>${escapeHtml(analysis.filename ?? 'informe.pdf')}</strong></td>
        <td>${escapeHtml(company)} ${ticker ? `<span class="td-ticker">${escapeHtml(ticker)}</span>` : ''}</td>
        <td>${escapeHtml(periodTitle)}</td>
        <td>${formatHistoryDate(analysis.period_end)}</td>
        <td>${formatHistoryDate(analysis.created_at)}</td>
        <td>${status}</td>
        <td>${analysis.pdf_url ? '<button class="row-action" type="button" aria-label="Abrir análisis" title="Abrir PDF del análisis">↗</button>' : ''}</td>
      </tr>
    `;
  }).join('');

  historyBody.querySelectorAll('tr[data-pdf-url]').forEach((row) => {
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.target.closest('button')) openHistoryPdf(row);
    });
  });
}

function openHistoryPdf(row) {
  const url = row?.dataset?.pdfUrl;
  if (!url) return;
  window.open(url, '_blank', 'noopener');
}

async function fetchAnalyses() {
  if (!currentUser) {
    renderHistory([]);
    return;
  }
  try {
    const response = await fetch(`/api/analyses?${historyQuery().toString()}`);
    const data = await response.json().catch(() => ({}));
    if (response.ok) renderHistory(data.analyses ?? []);
  } catch {
    renderHistory([]);
  }
}

document.addEventListener('click', (event) => {
  const row = event.target.closest('tr[data-pdf-url]');
  if (row && !event.target.closest('button')) {
    openHistoryPdf(row);
    return;
  }
  const rowAction = event.target.closest('tr[data-pdf-url] .row-action');
  if (rowAction) {
    event.preventDefault();
    event.stopPropagation();
    openHistoryPdf(rowAction.closest('tr'));
  }
});

historyCompanyInput.addEventListener('input', () => {
  clearTimeout(historyDebounceTimer);
  historyDebounceTimer = setTimeout(fetchAnalyses, 300);
});

[historyFromInput, historyToInput].forEach((input) => {
  input.addEventListener('change', fetchAnalyses);
});

document.querySelectorAll('input[name="history-date-type"]').forEach((radio) => {
  radio.addEventListener('change', fetchAnalyses);
});

document.querySelector('#history-clear').addEventListener('click', () => {
  historyCompanyInput.value = '';
  historyFromInput.value = '';
  historyToInput.value = '';
  document.querySelector('input[name="history-date-type"][value="period"]').checked = true;
  fetchAnalyses();
});

document.querySelector('#history-refresh').addEventListener('click', fetchAnalyses);
historyLoginButton.addEventListener('click', () => window.openModal?.('login'));

/* ── Navegación por secciones ──────────────────────────────── */

const homeMenu = document.querySelector('#home-menu');
const homeSections = {
  seguimiento: document.querySelector('#favoritos'),
  cartera: document.querySelector('#cartera'),
  analisis: document.querySelector('#analisis'),
};

function closeHomeSection() {
  homeMenu.hidden = false;
  Object.values(homeSections).forEach((section) => { section.hidden = true; });
  document.querySelectorAll('.home-top-link').forEach((button) => button.classList.remove('active'));
}

function openHomeSection(name, { scroll = true } = {}) {
  const section = homeSections[name];
  if (!section) return;
  homeMenu.hidden = true;
  Object.entries(homeSections).forEach(([key, other]) => { other.hidden = key !== name; });
  document.querySelectorAll('.home-top-link').forEach((button) => {
    button.classList.toggle('active', button.dataset.section === name);
  });
  if (scroll) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.querySelectorAll('.home-top-link, .home-menu-card').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.classList.contains('active')) {
      closeHomeSection();
      return;
    }
    openHomeSection(button.dataset.section);
  });
});

/* ── Listas de seguimiento ─────────────────────────────────── */

Watchlists.mountSection(document.querySelector('#watchlists-section'), {
  countEl: document.querySelector('#favorites-count'),
  onNavigate: goToCompany,
});

Portfolio.mountSection(document.querySelector('#portfolio-section'), {
  onNavigate: goToCompany,
});

window.addEventListener('auth:change', (event) => {
  currentUser = Boolean(event.detail?.user);
  Watchlists.setAuthenticated(currentUser);
  if (currentUser) Watchlists.refresh();
  Portfolio.setAuthenticated(currentUser);
  fetchAnalyses();
});

document.addEventListener('click', (event) => {
  const favoriteRow = event.target.closest('.favorites-market-table tbody tr[data-ticker]');
  if (favoriteRow && !event.target.closest('a, button')) {
    goToCompany(favoriteRow.dataset.ticker);
  }
});

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
        <img class="search-result-logo" src="https://companiesmarketcap.com/img/company-logos/64/${escapeHtml(company.ticker)}.webp" alt="" loading="lazy" data-letter="${escapeHtml((company.name || company.ticker || '?').slice(0, 1).toUpperCase())}">
        <span>${escapeHtml(company.name)}</span><strong>${escapeHtml(company.ticker)}</strong>
      </button>
    `).join('');
    searchResults.hidden = false;

    searchResults.querySelectorAll('.search-result').forEach((result) => {
      result.addEventListener('click', () => goToCompany(result.dataset.ticker));
    });
    searchResults.querySelectorAll('.search-result-logo').forEach((logo) => {
      logo.addEventListener('error', () => {
        const letter = document.createElement('span');
        letter.className = 'search-result-logo search-result-logo-fallback';
        letter.textContent = logo.dataset.letter || '?';
        logo.replaceWith(letter);
      });
    });
  }, 250);
}

tickerSearch.addEventListener('input', (event) => renderSearchResults(event.target.value));
tickerSearch.addEventListener('keydown', async (event) => {
  if (event.key === 'Escape') {
    searchResults.hidden = true;
    tickerSearch.blur();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const query = tickerSearch.value.trim();
    if (!query) return;
    if (/^[A-Z0-9.-]{1,10}$/i.test(query)) {
      goToCompany(query.toUpperCase());
      return;
    }
    const matches = await searchCompanies(query);
    if (!matches.length) {
      showToast('Sin resultados en EDGAR para esta búsqueda.');
      return;
    }
    goToCompany(matches[0].ticker);
  }
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.search-wrap')) searchResults.hidden = true;
});

const urlParams = new URLSearchParams(window.location.search);
const pendingTicker = (urlParams.get('analizar') ?? '').trim().toUpperCase();
const pendingAccession = urlParams.get('accession') ?? '';
if (/^[A-Z0-9.-]{1,10}$/.test(pendingTicker) && /^\d{10}-\d{2}-\d{6}$/.test(pendingAccession)) {
  history.replaceState(null, '', window.location.pathname);
  openHomeSection('analisis', { scroll: false });
  document.querySelector('#nuevo').scrollIntoView({ behavior: 'auto', block: 'start' });
  runFilingAnalysis(pendingTicker, pendingAccession);
} else if (urlParams.get('cartera') === '1') {
  history.replaceState(null, '', window.location.pathname);
  openHomeSection('cartera', { scroll: false });
  Portfolio.openSection();
} else {
  openHomeSection('seguimiento', { scroll: false });
}
