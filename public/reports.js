/**
 * =========================================================================
 * MÓDULO DE REPORTES E INCIDENCIAS (CIFRA TERMINAL)
 * - Modal y adjuntos de capturas para envío de reportes
 * - Pantalla de Reportes para Administrador:
 *   - Parte 1: Reportes por Análisis de IA (ordenado por empresa y por resultados)
 *   - Parte 2: Reportes Generales (incidencias de plataforma, bugs y sugerencias)
 * =========================================================================
 */

const ReportsModule = (() => {
  let generalModal = null;
  const MAX_IMAGES = 5;

  // Estado de la Pantalla de Reportes
  let activeTab = "ai"; // "ai" | "general"
  let aiData = null;
  let generalData = null;
  let statsData = null;
  let aiSearchQuery = "";
  let aiFilterMode = "all"; // "all" | "errors" | "rated"
  let generalStatusFilter = "all";
  let generalCategoryFilter = "all";
  let generalSearchQuery = "";
  let isGenerating = false;

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(d) {
    if (!d) return "—";
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatShortDate(d) {
    if (!d) return "—";
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function getCategoryLabel(cat) {
    const map = {
      incorrect_numbers: "Cifras erróneas",
      wrong_period: "Periodo incorrecto",
      missing_data: "Datos faltantes",
      wrong_classification: "Mala clasificación",
      bad_formatting: "Formato deficiente",
      bug: "Error técnico / Bug",
      market_data: "Datos de cotización",
      screener: "Buscador / Screener",
      portfolio: "Cartera",
      account: "Cuenta y acceso",
      suggestion: "Sugerencia / Mejora",
      general: "General",
      other: "Otro",
    };
    return map[cat] || cat || "General";
  }

  function getStatusBadge(status) {
    switch (status) {
      case "pending":
        return "<span class=\"report-status-badge status-pending\">Pendiente</span>";
      case "reviewed":
        return "<span class=\"report-status-badge status-reviewed\">En revisión</span>";
      case "resolved":
        return "<span class=\"report-status-badge status-resolved\">Resuelto</span>";
      case "dismissed":
        return "<span class=\"report-status-badge status-dismissed\">Descartado</span>";
      default:
        return "<span class=\"report-status-badge\">" + escapeHtml(status || "—") + "</span>";
    }
  }

  /**
   * Helper para crear un gestor de imágenes adjuntas (drag, drop, click, paste)
   */
  function createImageAttachmentManager({
    dropzoneEl,
    inputEl,
    previewEl,
    onImagesChange,
    maxImages = 5,
  }) {
    let imagesList = [];

    function renderPreviews() {
      if (!previewEl) return;
      if (imagesList.length === 0) {
        previewEl.innerHTML = "";
        previewEl.hidden = true;
        return;
      }

      previewEl.hidden = false;
      previewEl.innerHTML = imagesList.map((img, idx) => `
        <div class="report-thumb-item">
          <img src="${img}" alt="Captura ${idx + 1}" class="report-thumb-img">
          <button type="button" class="report-thumb-del" data-idx="${idx}" title="Quitar imagen" aria-label="Quitar captura">×</button>
        </div>
      `).join("");

      previewEl.querySelectorAll(".report-thumb-del").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const idx = parseInt(btn.dataset.idx, 10);
          imagesList.splice(idx, 1);
          renderPreviews();
          onImagesChange?.(imagesList);
        });
      });
    }

    function processFiles(files) {
      const imgFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
      if (!imgFiles.length) return;

      imgFiles.forEach(file => {
        if (imagesList.length >= maxImages) {
          if (typeof window.showToast === "function") {
            window.showToast(`Máximo ${maxImages} capturas permitidas por reporte.`);
          }
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          if (imagesList.length < maxImages) {
            imagesList.push(e.target.result);
            renderPreviews();
            onImagesChange?.(imagesList);
          }
        };
        reader.readAsDataURL(file);
      });
    }

    if (dropzoneEl && inputEl) {
      dropzoneEl.addEventListener("click", () => inputEl.click());

      inputEl.addEventListener("change", (e) => {
        if (e.target.files?.length) {
          processFiles(e.target.files);
          inputEl.value = "";
        }
      });

      // Drag & drop
      ["dragenter", "dragover"].forEach(evt => {
        dropzoneEl.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzoneEl.classList.add("is-dragover");
        });
      });

      ["dragleave", "drop"].forEach(evt => {
        dropzoneEl.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzoneEl.classList.remove("is-dragover");
        });
      });

      dropzoneEl.addEventListener("drop", (e) => {
        if (e.dataTransfer?.files?.length) {
          processFiles(e.dataTransfer.files);
        }
      });
    }

    return {
      getImages: () => [...imagesList],
      setImages: (imgs) => {
        imagesList = [...imgs];
        renderPreviews();
      },
      clear: () => {
        imagesList = [];
        renderPreviews();
        onImagesChange?.(imagesList);
      },
      handlePasteEvent: (e) => {
        const items = e.clipboardData?.items;
        if (!items) return false;
        let found = false;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith("image/")) {
            const file = items[i].getAsFile();
            if (file) {
              processFiles([file]);
              found = true;
            }
          }
        }
        return found;
      }
    };
  }

  let generalAttachmentMgr = null;

  function openGeneralModal() {
    if (!generalModal) {
      generalModal = document.querySelector("#app-report-modal-backdrop");
    }
    if (!generalModal) return;

    const form = document.querySelector("#app-report-form");
    if (form) form.reset();

    generalAttachmentMgr?.clear();
    generalModal.hidden = false;
    document.body.style.overflow = "hidden";

    setTimeout(() => {
      document.querySelector("#app-report-title")?.focus();
    }, 60);
  }

  function closeGeneralModal() {
    if (!generalModal) {
      generalModal = document.querySelector("#app-report-modal-backdrop");
    }
    if (!generalModal) return;

    generalModal.hidden = true;
    document.body.style.overflow = "";
  }

  async function submitGeneralReport(event) {
    event.preventDefault();
    const titleInput = document.querySelector("#app-report-title");
    const categorySelect = document.querySelector("#app-report-category");
    const descInput = document.querySelector("#app-report-desc");
    const submitBtn = document.querySelector("#app-report-submit-btn");

    const title = titleInput?.value?.trim() || "";
    const category = categorySelect?.value || "bug";
    const description = descInput?.value?.trim() || "";
    const images = generalAttachmentMgr?.getImages() || [];

    if (!title) {
      if (typeof window.showToast === "function") {
        window.showToast("Por favor, introduce un título para el reporte.");
      }
      titleInput?.focus();
      return;
    }

    if (!description) {
      if (typeof window.showToast === "function") {
        window.showToast("Por favor, detalla la descripción de la incidencia o sugerencia.");
      }
      descInput?.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando...";
    }

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          description,
          images,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        closeGeneralModal();
        if (typeof window.showToast === "function") {
          window.showToast("Reporte enviado con éxito. ¡Muchas gracias por tu colaboración!");
        }
        // Si estamos viendo la pantalla de reportes, refrescar lista
        const section = document.querySelector("#section-reportes");
        if (section && !section.hidden) {
          await fetchGeneralReports();
          await fetchStats();
          render();
        }
      } else {
        if (typeof window.showToast === "function") {
          window.showToast(data.error || "No se pudo enviar el reporte. Inténtalo de nuevo.");
        }
      }
    } catch {
      if (typeof window.showToast === "function") {
        window.showToast("Error de conexión al enviar el reporte.");
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Enviar reporte";
      }
    }
  }

  /* ── PANTALLA DE REPORTES (PANEL ADMIN) ── */

  async function fetchStats() {
    try {
      const res = await fetch("/api/admin/reports/stats");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        statsData = data.stats;
      }
    } catch (e) {
      console.warn("[reports:stats]", e);
    }
  }

  async function fetchAiReports() {
    const params = new URLSearchParams();
    if (aiSearchQuery.trim()) params.set("ticker", aiSearchQuery.trim());
    try {
      const res = await fetch("/api/admin/reports/ai?" + params.toString());
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        aiData = data;
      } else {
        if (typeof window.showToast === "function") {
          window.showToast(data.error || "No se pudieron cargar los reportes de IA.");
        }
      }
    } catch (e) {
      if (typeof window.showToast === "function") {
        window.showToast("Error de conexión al cargar reportes de IA.");
      }
    }
  }

  async function fetchGeneralReports() {
    const params = new URLSearchParams();
    if (generalStatusFilter !== "all") params.set("status", generalStatusFilter);
    if (generalCategoryFilter !== "all") params.set("category", generalCategoryFilter);
    if (generalSearchQuery.trim()) params.set("search", generalSearchQuery.trim());
    try {
      const res = await fetch("/api/admin/reports/general?" + params.toString());
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        generalData = data.reports || [];
      } else {
        if (typeof window.showToast === "function") {
          window.showToast(data.error || "No se pudieron cargar los reportes generales.");
        }
      }
    } catch (e) {
      if (typeof window.showToast === "function") {
        window.showToast("Error de conexión al cargar reportes generales.");
      }
    }
  }

  function renderHeader() {
    const aiBadge = statsData?.aiErrors?.pending_ai_errors
      ? "<span class=\"reports-tab-badge\">" + statsData.aiErrors.pending_ai_errors + "</span>"
      : "";
    const genBadge = statsData?.generalReports?.pending_general_reports
      ? "<span class=\"reports-tab-badge\">" + statsData.generalReports.pending_general_reports + "</span>"
      : "";

    return `
      <div class="reports-header-card">
        <div class="reports-title-wrap">
          <div class="reports-title-left">
            <span class="section-index">ADMINISTRACIÓN Y AUDITORÍA</span>
            <div class="reports-title-row">
              <h1 class="reports-main-title">Centro de Reportes</h1>
              <span class="reports-admin-pill">👑 Modo Administrador</span>
            </div>
            <p class="reports-subtitle">Supervisa los informes analizados con IA agrupados por empresa y resultados, gestiona incidencias de usuarios y revisa los reportes generales de la plataforma.</p>
          </div>
          <div class="reports-tabs-nav">
            <button type="button" class="reports-nav-btn ${activeTab === "ai" ? "active" : ""}" data-tab="ai">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3h7l5 5v13H7zM14 3v5h5"/><path d="M10 12h6M10 16h6"/></svg>
              <span>1. Reportes por Análisis de IA</span>
              ${aiBadge}
            </button>
            <button type="button" class="reports-nav-btn ${activeTab === "general" ? "active" : ""}" data-tab="general">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              <span>2. Reportes Generales</span>
              ${genBadge}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderStatsCards() {
    if (!statsData) return "";
    const a = statsData.analyses || {};
    const r = statsData.ratings || {};
    const aiErr = statsData.aiErrors || {};
    const gen = statsData.generalReports || {};

    return `
      <div class="reports-stats-grid">
        <div class="reports-stat-card">
          <div class="stat-icon-wrap stat-icon-blue">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg>
          </div>
          <div class="stat-info">
            <span class="stat-val">${a.total_analyses ?? 0}</span>
            <span class="stat-label">Análisis IA generados (${a.total_companies ?? 0} empresas)</span>
          </div>
        </div>
        <div class="reports-stat-card">
          <div class="stat-icon-wrap stat-icon-amber">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <div class="stat-info">
            <span class="stat-val">${r.average_rating ? r.average_rating + " ★" : "—"}</span>
            <span class="stat-label">Valoración media (${r.total_ratings ?? 0} votos)</span>
          </div>
        </div>
        <div class="reports-stat-card">
          <div class="stat-icon-wrap ${aiErr.pending_ai_errors > 0 ? "stat-icon-red" : "stat-icon-green"}">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div class="stat-info">
            <span class="stat-val">${aiErr.pending_ai_errors ?? 0}</span>
            <span class="stat-label">Incidencias en análisis pendientes</span>
          </div>
        </div>
        <div class="reports-stat-card">
          <div class="stat-icon-wrap ${gen.pending_general_reports > 0 ? "stat-icon-red" : "stat-icon-green"}">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div class="stat-info">
            <span class="stat-val">${gen.pending_general_reports ?? 0}</span>
            <span class="stat-label">Reportes generales pendientes</span>
          </div>
        </div>
      </div>
    `;
  }

  /* ── PARTE 1: Renderizado de Análisis de IA por Empresa y Resultados ── */
  function renderAiTab() {
    const companies = aiData?.companies || [];
    let filteredCompanies = companies;

    if (aiFilterMode === "errors") {
      filteredCompanies = filteredCompanies.filter((c) => c.totalErrors > 0);
    } else if (aiFilterMode === "rated") {
      filteredCompanies = filteredCompanies.filter((c) =>
        c.results.some((r) => Number(r.rating_count) > 0)
      );
    }

    let listHtml = "";
    if (!filteredCompanies.length) {
      listHtml = `
        <div class="reports-empty-state">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#9ca3af" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <h3>No se encontraron análisis</h3>
          <p>${aiSearchQuery ? "No hay resultados para \"" + escapeHtml(aiSearchQuery) + "\"." : "Aún no se ha generado ningún análisis de informe con IA en la plataforma."}</p>
        </div>
      `;
    } else {
      listHtml = filteredCompanies.map((company) => {
        const hasErrors = company.totalErrors > 0;
        const resultsCount = company.results.length;

        const resultsListHtml = company.results.map((res) => {
          const ratingAvg = res.rating_average ? Number(res.rating_average).toFixed(1) : null;
          const ratingCount = Number(res.rating_count) || 0;
          const errCount = Number(res.error_reports_count) || 0;
          const errorsList = Array.isArray(res.error_reports) ? res.error_reports : [];
          const formType = res.form_type || "10-Q";
          const periodLabel = res.period_title || res.period_label || formatShortDate(res.period_end) || "Periodo";

          let errorsSectionHtml = "";
          if (errCount > 0) {
            errorsSectionHtml = `
              <div class="res-error-reports-wrap">
                <div class="res-error-reports-title">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ef4444" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <span>${errCount} ${errCount === 1 ? "incidencia reportada" : "incidencias reportadas"} por usuarios sobre este análisis:</span>
                </div>
                <div class="res-errors-list">
                  ${errorsList.map((err) => `
                    <div class="res-error-card status-${escapeHtml(err.status || "pending")}">
                      <div class="res-error-head">
                        <span class="res-error-category">${escapeHtml(getCategoryLabel(err.category))}</span>
                        ${getStatusBadge(err.status)}
                        <span class="res-error-date">${formatDate(err.created_at)}</span>
                        ${err.user_email ? `<span class="res-error-user">👤 ${escapeHtml(err.user_email)}</span>` : "<span class=\"res-error-user\">👤 Anónimo</span>"}
                      </div>
                      <div class="res-error-desc">${escapeHtml(err.description)}</div>
                      <div class="res-error-actions-row">
                        <label class="res-error-status-label">
                          Estado:
                          <select class="res-error-status-select" data-error-id="${err.id}">
                            <option value="pending" ${err.status === "pending" ? "selected" : ""}>Pendiente</option>
                            <option value="reviewed" ${err.status === "reviewed" ? "selected" : ""}>En revisión</option>
                            <option value="resolved" ${err.status === "resolved" ? "selected" : ""}>Resuelto</option>
                            <option value="dismissed" ${err.status === "dismissed" ? "selected" : ""}>Descartado</option>
                          </select>
                        </label>
                        <input type="text" class="res-error-notes-input" data-error-id="${err.id}" placeholder="Nota interna del admin..." value="${escapeHtml(err.admin_notes || "")}">
                        <button type="button" class="btn-save-error-notes secondary-button btn-xs" data-error-id="${err.id}">Guardar</button>
                        <button type="button" class="btn-del-error danger-button btn-xs" data-error-id="${err.id}" title="Eliminar incidencia">🗑️</button>
                      </div>
                    </div>
                  `).join("")}
                </div>
              </div>
            `;
          }

          return `
            <div class="company-result-item" data-analysis-id="${res.id}">
              <div class="result-item-main">
                <div class="result-item-identity">
                  <span class="filing-badge ${formType === "10-K" ? "filing-badge-10k" : "filing-badge-10q"}">${escapeHtml(formType)}</span>
                  <strong class="result-item-period">${escapeHtml(periodLabel)}</strong>
                  <span class="result-item-accession" title="Accession SEC">${escapeHtml(res.accession || "—")}</span>
                  <span class="result-item-date" title="Fecha en que se analizó con IA">📅 Generado: ${formatShortDate(res.created_at)}</span>
                  ${res.model_used ? `<span class="result-item-model">🤖 ${escapeHtml(res.model_used)}</span>` : ""}
                  ${res.version ? `<span class="result-item-version" title="Versión del análisis">Versión ${escapeHtml(res.version)}</span>` : ""}
                </div>

                <div class="result-item-feedback-pill">
                  ${ratingCount > 0
                    ? `<span class="res-rating-pill" title="${ratingCount} valoraciones de usuarios"><span class="star">★</span> ${ratingAvg} (${ratingCount})</span>`
                    : `<span class="res-rating-pill pill-muted" title="Sin valoraciones aún">★ —</span>`
                  }
                  ${errCount > 0
                    ? `<span class="res-error-pill pill-warning" title="${errCount} incidencias reportadas">⚠️ ${errCount} ${errCount === 1 ? "reporte" : "reportes"}</span>`
                    : `<span class="res-error-pill pill-ok">✓ Sin fallos reportados</span>`
                  }
                </div>

                <div class="result-item-actions">
                  <button type="button" class="btn-view-analysis secondary-button btn-sm" data-analysis-id="${res.id}" data-ticker="${escapeHtml(res.ticker)}" data-accession="${escapeHtml(res.accession)}">
                    👁️ Ver análisis
                  </button>
                  <button type="button" class="btn-regenerate-analysis primary-button btn-sm btn-regen" data-analysis-id="${res.id}" data-ticker="${escapeHtml(res.ticker)}" data-accession="${escapeHtml(res.accession)}" title="Generar una versión nueva con IA (se conservan las anteriores)">
                    🔄 Regenerar con IA
                  </button>
                  <button type="button" class="btn-delete-analysis danger-button btn-sm" data-analysis-id="${res.id}" data-ticker="${escapeHtml(res.ticker)}" data-period="${escapeHtml(periodLabel)}" title="Eliminar informe">
                    🗑️
                  </button>
                </div>
              </div>

              ${errorsSectionHtml}
            </div>
          `;
        }).join("");

        const compTicker = String(company.ticker || "DEMO");
        const compName = String(company.companyName || company.ticker || "Empresa");
        const compLogo = compTicker.slice(0, 4);

        return `
          <div class="company-reports-card ${hasErrors ? "card-has-errors" : ""}">
            <div class="company-card-header">
              <div class="company-card-left">
                <span class="company-card-logo">${escapeHtml(compLogo)}</span>
                <div>
                  <div class="company-card-title-row">
                    <h3 class="company-card-name">${escapeHtml(compName)}</h3>
                    <span class="company-card-ticker">${escapeHtml(compTicker)}</span>
                  </div>
                  <span class="company-card-sub">${resultsCount} ${resultsCount === 1 ? "informe analizado" : "informes analizados"} por la IA</span>
                </div>
              </div>
              <div class="company-card-right">
                ${hasErrors
                  ? `<span class="company-error-alert-badge">⚠️ ${company.totalErrors} ${company.totalErrors === 1 ? "incidencia pendiente" : "incidencias pendientes"}</span>`
                  : `<span class="company-ok-badge">✓ Informes al día</span>`
                }
              </div>
            </div>

            <div class="company-results-container">
              ${resultsListHtml}
            </div>
          </div>
        `;
      }).join("");
    }

    return `
      <div class="reports-tab-content">
        <div class="reports-toolbar">
          <div class="reports-search-wrap">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="search" id="reports-ai-search" class="reports-search-input" placeholder="Buscar por ticker o empresa (ej. KO, PEP, Kraft)..." value="${escapeHtml(aiSearchQuery)}">
          </div>
          <div class="reports-filter-chips">
            <button type="button" class="report-chip ${aiFilterMode === "all" ? "active" : ""}" data-filter-mode="all">Todas las empresas</button>
            <button type="button" class="report-chip ${aiFilterMode === "errors" ? "active" : ""}" data-filter-mode="errors">⚠️ Con incidencias de usuarios</button>
            <button type="button" class="report-chip ${aiFilterMode === "rated" ? "active" : ""}" data-filter-mode="rated">★ Con valoraciones</button>
          </div>
          <button type="button" class="secondary-button btn-sm" id="btn-refresh-ai-reports" title="Recargar lista">
            🔄 Refrescar
          </button>
        </div>

        <div class="company-reports-list">
          ${listHtml}
        </div>
      </div>
    `;
  }

  /* ── PARTE 2: Renderizado de Reportes Generales ── */
  function renderGeneralTab() {
    const reports = generalData || [];

    let tableRows = "";
    if (!reports.length) {
      tableRows = `
        <tr>
          <td colspan="7" class="reports-table-empty">
            No se han registrado reportes generales aún o no coinciden con los filtros aplicados.
          </td>
        </tr>
      `;
    } else {
      tableRows = reports.map((r) => {
        const rawImages = Array.isArray(r.images) ? r.images : [];

        let imagesThumb = "";
        if (rawImages.length > 0) {
          imagesThumb = `
            <div class="report-images-row">
              ${rawImages.map((img, i) => `
                <a href="${escapeHtml(img)}" target="_blank" rel="noopener" class="report-img-thumb-link" title="Ver captura adjunta ${i + 1}">
                  <img src="${escapeHtml(img)}" class="report-img-thumb" alt="Captura">
                </a>
              `).join("")}
            </div>
          `;
        }

        return `
          <tr class="general-report-row" data-report-id="${r.id}">
            <td class="col-id">#${r.id}</td>
            <td class="col-date">${formatDate(r.created_at)}</td>
            <td class="col-category"><span class="category-tag tag-${escapeHtml(r.category)}">${escapeHtml(getCategoryLabel(r.category))}</span></td>
            <td class="col-details">
              <strong class="general-report-title">${escapeHtml(r.title)}</strong>
              <p class="general-report-desc">${escapeHtml(r.description)}</p>
              ${imagesThumb}
            </td>
            <td class="col-user">
              ${r.user_email ? `<span title="${escapeHtml(r.user_email)}">👤 ${escapeHtml(r.user_email)}</span>` : "<span class=\"text-muted\">Anónimo</span>"}
            </td>
            <td class="col-status">
              <select class="general-status-select" data-report-id="${r.id}">
                <option value="pending" ${r.status === "pending" ? "selected" : ""}>Pendiente</option>
                <option value="reviewed" ${r.status === "reviewed" ? "selected" : ""}>En revisión</option>
                <option value="resolved" ${r.status === "resolved" ? "selected" : ""}>Resuelto</option>
                <option value="dismissed" ${r.status === "dismissed" ? "selected" : ""}>Descartado</option>
              </select>
            </td>
            <td class="col-actions">
              <div class="report-notes-row">
                <input type="text" class="general-notes-input" data-report-id="${r.id}" placeholder="Nota de resolución..." value="${escapeHtml(r.admin_notes || "")}">
                <button type="button" class="btn-save-general-notes secondary-button btn-xs" data-report-id="${r.id}">Guardar</button>
                <button type="button" class="btn-delete-general danger-button btn-xs" data-report-id="${r.id}" title="Eliminar reporte">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }

    return `
      <div class="reports-tab-content">
        <div class="reports-toolbar">
          <div class="reports-search-wrap">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="search" id="reports-general-search" class="reports-search-input" placeholder="Buscar en reportes generales..." value="${escapeHtml(generalSearchQuery)}">
          </div>
          <div class="reports-filters-group">
            <select id="general-filter-status" class="reports-select">
              <option value="all" ${generalStatusFilter === "all" ? "selected" : ""}>Todos los estados</option>
              <option value="pending" ${generalStatusFilter === "pending" ? "selected" : ""}>Solo Pendientes</option>
              <option value="reviewed" ${generalStatusFilter === "reviewed" ? "selected" : ""}>En revisión</option>
              <option value="resolved" ${generalStatusFilter === "resolved" ? "selected" : ""}>Resueltos</option>
              <option value="dismissed" ${generalStatusFilter === "dismissed" ? "selected" : ""}>Descartados</option>
            </select>
            <select id="general-filter-category" class="reports-select">
              <option value="all" ${generalCategoryFilter === "all" ? "selected" : ""}>Todas las categorías</option>
              <option value="bug" ${generalCategoryFilter === "bug" ? "selected" : ""}>Bug / Error web</option>
              <option value="market_data" ${generalCategoryFilter === "market_data" ? "selected" : ""}>Datos de mercado</option>
              <option value="screener" ${generalCategoryFilter === "screener" ? "selected" : ""}>Screener</option>
              <option value="portfolio" ${generalCategoryFilter === "portfolio" ? "selected" : ""}>Cartera</option>
              <option value="suggestion" ${generalCategoryFilter === "suggestion" ? "selected" : ""}>Sugerencia</option>
              <option value="account" ${generalCategoryFilter === "account" ? "selected" : ""}>Cuenta</option>
              <option value="general" ${generalCategoryFilter === "general" ? "selected" : ""}>General</option>
            </select>
          </div>
          <button type="button" class="primary-button btn-sm" id="btn-create-general-report">
            ➕ Nuevo reporte
          </button>
          <button type="button" class="secondary-button btn-sm" id="btn-refresh-general-reports" title="Recargar lista">
            🔄 Refrescar
          </button>
        </div>

        <div class="reports-table-responsive">
          <table class="reports-data-table">
            <thead>
              <tr>
                <th style="width: 50px;">ID</th>
                <th style="width: 140px;">Fecha</th>
                <th style="width: 130px;">Categoría</th>
                <th>Detalles de la incidencia / feedback</th>
                <th style="width: 150px;">Usuario</th>
                <th style="width: 130px;">Estado</th>
                <th style="width: 200px;">Acciones & Notas</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* ── Interacciones y Event Listeners ── */
  function wireEvents(container) {
    // Pestañas
    container.querySelectorAll(".reports-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });

    // PARTE 1 - Eventos de IA
    const aiSearchInput = container.querySelector("#reports-ai-search");
    if (aiSearchInput) {
      let debounce = null;
      aiSearchInput.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          aiSearchQuery = aiSearchInput.value;
          fetchAiReports().then(() => render());
        }, 300);
      });
    }

    container.querySelectorAll("[data-filter-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        aiFilterMode = btn.dataset.filterMode;
        render();
      });
    });

    container.querySelector("#btn-refresh-ai-reports")?.addEventListener("click", async () => {
      await fetchAiReports();
      await fetchStats();
      render();
      if (typeof window.showToast === "function") window.showToast("Lista de análisis de IA actualizada.");
    });

    // Ver análisis
    container.querySelectorAll(".btn-view-analysis").forEach((btn) => {
      btn.addEventListener("click", () => {
        const analysisId = btn.dataset.analysisId;
        const ticker = btn.dataset.ticker;
        const accession = btn.dataset.accession;
        document.querySelectorAll(".nav-link[data-section]").forEach((item) => item.classList.toggle("active", item.dataset.section === "analisis"));
        if (typeof showSection === "function") showSection("analisis");
        history.pushState(null, "", "/analisis");
        if (window.AnalysisModule) {
          window.AnalysisModule.runFilingAnalysis(ticker, accession);
        }
      });
    });

    // Regenerar análisis con IA (Requisito 1 & 2)
    container.querySelectorAll(".btn-regenerate-analysis").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (isGenerating) return;
        const ticker = btn.dataset.ticker;
        const accession = btn.dataset.accession;
        const analysisId = btn.dataset.analysisId;

        const confirmMsg = "Estás a punto de volver a generar el informe de " + ticker + " (" + accession + ").\n\n⚠️ Se creará una versión nueva desde cero con la IA y se conservarán las versiones anteriores.\n\n¿Deseas continuar?";
        if (!confirm(confirmMsg)) return;

        // Navegar a la sección de análisis y disparar regeneración forzada
        document.querySelectorAll(".nav-link[data-section]").forEach((item) => item.classList.toggle("active", item.dataset.section === "analisis"));
        if (typeof showSection === "function") showSection("analisis");
        history.pushState(null, "", "/analisis");
        if (window.AnalysisModule) {
          window.AnalysisModule.runFilingAnalysis(ticker, accession, { force: true });
        }
      });
    });

    // Eliminar análisis
    container.querySelectorAll(".btn-delete-analysis").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.analysisId;
        const ticker = btn.dataset.ticker;
        const period = btn.dataset.period;
        if (!confirm("¿Eliminar definitivamente el análisis de " + ticker + " (" + period + ")?\n\nEsta acción no se puede deshacer.")) return;

        try {
          const res = await fetch("/api/admin/reports/ai-analysis/" + id, { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            if (typeof window.showToast === "function") window.showToast("Informe de análisis eliminado.");
            await fetchAiReports();
            await fetchStats();
            render();
          } else {
            if (typeof window.showToast === "function") window.showToast(data.error || "No se pudo eliminar el informe.");
          }
        } catch {
          if (typeof window.showToast === "function") window.showToast("Error de conexión al eliminar.");
        }
      });
    });

    // Guardar notas o cambiar estado de incidencia en IA
    container.querySelectorAll(".res-error-status-select").forEach((sel) => {
      sel.addEventListener("change", async () => {
        const errorId = sel.dataset.errorId;
        const status = sel.value;
        await updateAiError(errorId, { status });
      });
    });

    container.querySelectorAll(".btn-save-error-notes").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const errorId = btn.dataset.errorId;
        const input = container.querySelector(".res-error-notes-input[data-error-id=\"" + errorId + "\"]");
        const adminNotes = input?.value || "";
        await updateAiError(errorId, { adminNotes });
      });
    });

    container.querySelectorAll(".btn-del-error").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const errorId = btn.dataset.errorId;
        if (!confirm("¿Eliminar este reporte de incidencia?")) return;
        try {
          const res = await fetch("/api/admin/reports/ai/" + errorId, { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            if (typeof window.showToast === "function") window.showToast("Incidencia eliminada.");
            await fetchAiReports();
            await fetchStats();
            render();
          } else {
            if (typeof window.showToast === "function") window.showToast(data.error || "No se pudo eliminar.");
          }
        } catch {
          if (typeof window.showToast === "function") window.showToast("Error de conexión al eliminar.");
        }
      });
    });

    // PARTE 2 - Eventos de Reportes Generales
    const genSearchInput = container.querySelector("#reports-general-search");
    if (genSearchInput) {
      let debounce = null;
      genSearchInput.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          generalSearchQuery = genSearchInput.value;
          fetchGeneralReports().then(() => render());
        }, 300);
      });
    }

    container.querySelector("#general-filter-status")?.addEventListener("change", (e) => {
      generalStatusFilter = e.target.value;
      fetchGeneralReports().then(() => render());
    });

    container.querySelector("#general-filter-category")?.addEventListener("change", (e) => {
      generalCategoryFilter = e.target.value;
      fetchGeneralReports().then(() => render());
    });

    container.querySelector("#btn-create-general-report")?.addEventListener("click", openGeneralModal);

    container.querySelector("#btn-refresh-general-reports")?.addEventListener("click", async () => {
      await fetchGeneralReports();
      await fetchStats();
      render();
      if (typeof window.showToast === "function") window.showToast("Lista de reportes generales actualizada.");
    });

    container.querySelectorAll(".general-status-select").forEach((sel) => {
      sel.addEventListener("change", async () => {
        const reportId = sel.dataset.reportId;
        const status = sel.value;
        await updateGeneralReport(reportId, { status });
      });
    });

    container.querySelectorAll(".btn-save-general-notes").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const reportId = btn.dataset.reportId;
        const input = container.querySelector(".general-notes-input[data-report-id=\"" + reportId + "\"]");
        const adminNotes = input?.value || "";
        await updateGeneralReport(reportId, { adminNotes });
      });
    });

    container.querySelectorAll(".btn-delete-general").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const reportId = btn.dataset.reportId;
        if (!confirm("¿Eliminar este reporte general?")) return;
        try {
          const res = await fetch("/api/admin/reports/general/" + reportId, { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            if (typeof window.showToast === "function") window.showToast("Reporte eliminado.");
            await fetchGeneralReports();
            await fetchStats();
            render();
          } else {
            if (typeof window.showToast === "function") window.showToast(data.error || "No se pudo eliminar.");
          }
        } catch {
          if (typeof window.showToast === "function") window.showToast("Error de conexión al eliminar.");
        }
      });
    });
  }

  async function updateAiError(errorId, payload) {
    try {
      const res = await fetch("/api/admin/reports/ai/" + errorId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        if (typeof window.showToast === "function") window.showToast("Incidencia actualizada.");
        await fetchAiReports();
        await fetchStats();
        render();
      } else {
        if (typeof window.showToast === "function") window.showToast(data.error || "No se pudo actualizar la incidencia.");
      }
    } catch {
      if (typeof window.showToast === "function") window.showToast("Error de conexión al actualizar incidencia.");
    }
  }

  async function updateGeneralReport(reportId, payload) {
    try {
      const res = await fetch("/api/admin/reports/general/" + reportId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        if (typeof window.showToast === "function") window.showToast("Reporte general actualizado.");
        await fetchGeneralReports();
        await fetchStats();
        render();
      } else {
        if (typeof window.showToast === "function") window.showToast(data.error || "No se pudo actualizar el reporte.");
      }
    } catch {
      if (typeof window.showToast === "function") window.showToast("Error de conexión al actualizar reporte.");
    }
  }

  async function render() {
    const container = document.querySelector("#section-reportes");
    if (!container) return;

    // Si aún no sabemos si es admin o la sesión se está cargando, mostramos loader sutil
    if (window.AuthModule?.isReady && !window.AuthModule.isReady() && window.currentUser === undefined) {
      container.innerHTML = `
        <div class="reports-loading-state" style="text-align:center;padding:70px 20px;">
          <div style="font-size:32px;margin-bottom:12px;">⏳</div>
          <h3 style="margin:0 0 6px;color:#0f172a;">Verificando credenciales de administración...</h3>
          <p style="color:#64748b;margin:0;font-size:13px;">Cargando centro de reportes de Cifra.</p>
        </div>
      `;
    }

    // Si la sesión de autenticación aún no se ha resuelto, esperamos
    if (window.AuthModule?.whenReady) {
      await window.AuthModule.whenReady();
    } else {
      await new Promise((resolve) => {
        if (window.currentUser !== undefined) return resolve();
        const onAuth = () => {
          window.removeEventListener("auth:change", onAuth);
          resolve();
        };
        window.addEventListener("auth:change", onAuth, { once: true });
        setTimeout(resolve, 800);
      });
    }

    // Verificar permisos de admin
    const isAdmin = Boolean(window.AuthModule?.isAdmin?.() || window.currentUser?.isAdmin);
    if (!isAdmin) {
      container.innerHTML = `
        <div class="reports-unauthorized-card">
          <div class="unauthorized-icon">🔒</div>
          <h2>Acceso restringido a administradores</h2>
          <p>Esta pantalla es exclusiva para el equipo de administración de Cifra. Inicia sesión con tu cuenta autorizada para acceder a los reportes y gestión de análisis.</p>
          <button type="button" class="primary-button" onclick="window.AuthModule?.openModal?.('login')">Iniciar sesión</button>
        </div>
      `;
      return;
    }

    if (!statsData && !aiData) {
      container.innerHTML = `
        <div class="reports-loading-state" style="text-align:center;padding:70px 20px;">
          <div style="font-size:32px;margin-bottom:12px;">📊</div>
          <h3 style="margin:0 0 6px;color:#0f172a;">Cargando centro de reportes...</h3>
          <p style="color:#64748b;margin:0;font-size:13px;">Recuperando informes y estadísticas de la plataforma.</p>
        </div>
      `;
    }

    try {
      if (!statsData) await fetchStats();
      if (activeTab === "ai" && !aiData) await fetchAiReports();
      if (activeTab === "general" && !generalData) await fetchGeneralReports();

      container.innerHTML = `
        <div class="reports-page-wrapper">
          ${renderHeader()}
          ${renderStatsCards()}
          ${activeTab === "ai" ? renderAiTab() : renderGeneralTab()}
        </div>
      `;

      wireEvents(container);
    } catch (err) {
      console.error("[reports] Error al renderizar centro de reportes:", err);
      container.innerHTML = `
        <div class="reports-unauthorized-card" style="border-color:#fca5a5;">
          <div class="unauthorized-icon">⚠️</div>
          <h2>Error al cargar el centro de reportes</h2>
          <p>Ocurrió un error inesperado al procesar los datos de los informes: ${escapeHtml(err.message)}</p>
          <button type="button" class="primary-button" id="btn-retry-reports">Reintentar carga</button>
        </div>
      `;
      container.querySelector("#btn-retry-reports")?.addEventListener("click", () => {
        aiData = null;
        statsData = null;
        generalData = null;
        render();
      });
    }
  }

  function init() {
    generalModal = document.querySelector("#app-report-modal-backdrop");

    // Botón disparador en el sidebar footer
    const triggerBtn = document.querySelector("#app-report-btn");
    if (triggerBtn) {
      triggerBtn.addEventListener("click", (e) => {
        e.preventDefault();
        openGeneralModal();
      });
    }

    // Botones de cierre
    document.querySelector("#app-report-modal-close")?.addEventListener("click", closeGeneralModal);
    document.querySelector("#app-report-cancel-btn")?.addEventListener("click", closeGeneralModal);

    // Clic fuera en el backdrop
    generalModal?.addEventListener("click", (e) => {
      if (e.target === generalModal) closeGeneralModal();
    });

    // Cierre con Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && generalModal && !generalModal.hidden) {
        closeGeneralModal();
      }
    });

    // Envío del formulario
    document.querySelector("#app-report-form")?.addEventListener("submit", submitGeneralReport);

    // Inicializar el gestor de capturas para el modal general
    generalAttachmentMgr = createImageAttachmentManager({
      dropzoneEl: document.querySelector("#app-report-dropzone"),
      inputEl: document.querySelector("#app-report-file-input"),
      previewEl: document.querySelector("#app-report-previews"),
      maxImages: MAX_IMAGES,
    });

    // Soporte para pegar capturas con Ctrl+V cuando el modal general esté visible
    window.addEventListener("paste", (e) => {
      if (generalModal && !generalModal.hidden) {
        const handled = generalAttachmentMgr.handlePasteEvent(e);
        if (handled && typeof window.showToast === "function") {
          window.showToast("Captura de pantalla pegada.");
        }
      }
    });

    // Escuchar cambios de autenticación
    window.addEventListener("auth:change", (e) => {
      const section = document.querySelector("#section-reportes");
      const activeNav = document.querySelector('.nav-link[data-section="reportes"]');
      const isReportesActive = (activeNav && activeNav.classList.contains("active")) ||
                               window.location.pathname.startsWith("/reporte") ||
                               window.location.pathname.startsWith("/admin");

      if (section && (!section.hidden || isReportesActive)) {
        if (section.hidden && isReportesActive) section.hidden = false;
        aiData = null;
        generalData = null;
        statsData = null;
        render();
      }
    });
  }

  return {
    init,
    open: openGeneralModal,
    close: closeGeneralModal,
    createImageAttachmentManager,
    render,
    fetchStats,
    fetchAiReports,
    fetchGeneralReports,
  };
})();

window.ReportsModule = ReportsModule;
window.AdminReportsModule = ReportsModule;

// Escuchar auth:change inmediatamente sin esperar a DOMContentLoaded
window.addEventListener("auth:change", (e) => {
  const section = document.querySelector("#section-reportes");
  const activeNav = document.querySelector('.nav-link[data-section="reportes"]');
  const isReportesActive = (activeNav && activeNav.classList.contains("active")) ||
                           window.location.pathname.startsWith("/reporte") ||
                           window.location.pathname.startsWith("/admin");

  if (section && (!section.hidden || isReportesActive)) {
    if (section.hidden && isReportesActive) section.hidden = false;
    ReportsModule.render();
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => ReportsModule.init());
} else {
  ReportsModule.init();
}
