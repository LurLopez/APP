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

  row.classList.remove('active', 'done');
  const stateLabel = row.querySelector('.agent-state');
  if (state === 'active') {
    row.classList.add('active');
    stateLabel.textContent = 'Procesando';
  }
  if (state === 'done') {
    row.classList.add('done');
    stateLabel.textContent = 'Completado';
  }
}

function resetAgentStates() {
  ['origin', 'sector', 'analyst'].forEach((agent) => {
    const row = document.querySelector(`[data-agent="${agent}"]`);
    row.classList.remove('active', 'done');
    row.querySelector('.agent-state').textContent = 'En espera';
  });
}

function runDemoAnalysis() {
  clearInterval(analysisTimer);
  let seconds = 1;
  let step = 0;
  const agents = ['origin', 'sector', 'analyst'];
  const titles = ['Comprobando el origen...', 'Validando el sector...', 'Construyendo el informe...'];

  processingPanel.hidden = false;
  resultPreview.hidden = true;
  uploadForm.hidden = true;
  resetAgentStates();
  progressBar.style.width = '4%';
  processingTitle.textContent = titles[0];
  processingTime.textContent = '00:01';
  setAgentState(agents[0], 'active');

  analysisTimer = setInterval(() => {
    seconds += 1;
    processingTime.textContent = `00:${String(seconds).padStart(2, '0')}`;

    if (step < agents.length - 1) {
      setAgentState(agents[step], 'done');
      step += 1;
      setAgentState(agents[step], 'active');
      processingTitle.textContent = titles[step];
      progressBar.style.width = `${(step + 1) * 30 + 4}%`;
    } else {
      setAgentState(agents[step], 'done');
      progressBar.style.width = '100%';
      processingTitle.textContent = 'Análisis completado';
      clearInterval(analysisTimer);
      setTimeout(() => {
        processingPanel.hidden = true;
        resultPreview.hidden = false;
        showToast('El análisis de demostración está listo.');
      }, 650);
    }
  }, 1050);
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
  runDemoAnalysis();
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
