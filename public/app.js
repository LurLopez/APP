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
  window.open(currentPdfUrl, '_blank', 'noopener');
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

const companies = [
  { ticker: 'TAP', name: 'Molson Coors' },
  { ticker: 'KO', name: 'Coca-Cola' },
  { ticker: 'PEP', name: 'PepsiCo' },
  { ticker: 'WMT', name: 'Walmart' },
];

function renderSearchResults(query) {
  const normalizedQuery = query.trim().toLowerCase();
  const matches = companies.filter((company) =>
    company.ticker.toLowerCase().includes(normalizedQuery) || company.name.toLowerCase().includes(normalizedQuery),
  );

  if (!normalizedQuery || !matches.length) {
    searchResults.hidden = true;
    searchResults.innerHTML = '';
    return;
  }

  searchResults.innerHTML = matches.map((company) => `
    <button class="search-result" type="button" data-ticker="${company.ticker}">
      <span>${company.name}</span><strong>${company.ticker}</strong>
    </button>
  `).join('');
  searchResults.hidden = false;

  searchResults.querySelectorAll('.search-result').forEach((result) => {
    result.addEventListener('click', () => {
      tickerSearch.value = result.dataset.ticker;
      searchResults.hidden = true;
      document.querySelector('#nuevo').scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast(`Empresa seleccionada: ${result.dataset.ticker}. El buscador de filings estará disponible en la Fase 2.`);
    });
  });
}

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

document.querySelectorAll('.close-button').forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.dismiss
      ? document.querySelector(button.dataset.dismiss)
      : button.closest('.welcome-section');
    if (target) target.hidden = true;
  });
});

document.querySelector('.copy-field button').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText('cifra-beta-local');
    showToast('Referencia copiada.');
  } catch {
    showToast('Referencia: cifra-beta-local');
  }
});
