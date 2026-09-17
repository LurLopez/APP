/**
 * =========================================================================
 * MÓDULO DE GUÍAS DE CIFRA
 * =========================================================================
 * Apartados:
 * 1. Aviso y Proyecto (disclaimer de inversor particular, qué ofrece Cifra,
 *    análisis con IA en informes trimestrales, límites y donaciones)
 * 2. Datos Financieros (cuenta de resultados, balance de situación, cash flows)
 * 3. Cartera (gestión, ponderaciones, rentabilidad, operaciones)
 * 4. Análisis con IA (lectura de 10-Q / 10-K, metodología sectorial)
 * =========================================================================
 */

(function () {
  'use strict';

  function escapeHtml(value) {
    if (window.HtmlUtils && typeof window.HtmlUtils.escapeHtml === 'function') {
      return window.HtmlUtils.escapeHtml(value);
    }
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const APARTADOS = [
    {
      id: 'aviso',
      nombre: 'Aviso y Proyecto',
      badge: 'Disclaimer & Beta',
      iconoSvg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      descripcion: 'Aviso importante sobre el proyecto Cifra, herramientas disponibles, funcionamiento del análisis con IA y estado actual de desarrollo.'
    },
    {
      id: 'datos-financieros',
      nombre: 'Datos Financieros',
      badge: 'Estados y Métricas',
      iconoSvg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
      descripcion: 'Guías de consulta sobre los tres estados contables fundamentales: cuenta de resultados, balance de situación y estado de flujos de caja.'
    },
    {
      id: 'cartera',
      nombre: 'Cartera',
      badge: 'Gestión y Rentabilidad',
      iconoSvg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
      descripcion: 'Guías sobre gestión de cartera, registro de transacciones, diversificación y seguimiento de rentabilidad.',
      emptyTitulo: 'Apartado de Cartera',
      emptyTexto: 'Este apartado está preparado para incorporar las guías sobre el funcionamiento de la cartera, asignación de activos, registro de operaciones y cálculo de rendimientos. El contenido se añadirá próximamente.'
    },
    {
      id: 'analisis-ia',
      nombre: 'Análisis con IA',
      badge: 'Metodología e IA',
      iconoSvg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
      descripcion: 'Guías sobre el motor de análisis de Cifra, interpretación de informes SEC con IA y marcos de análisis por sectores.',
      emptyTitulo: 'Apartado de Análisis con IA',
      emptyTexto: 'Este apartado está preparado para incorporar las guías sobre el sistema multi-agente de Cifra, lectura estructurada de informes 10-Q y 10-K y análisis adaptado a cada sector. El contenido se añadirá próximamente.'
    }
  ];

  const DATOS_FINANCIEROS_TABS = [
    {
      id: 'cuenta-resultados',
      nombre: 'Cuenta de Resultados',
      badge: 'Income Statement (P&G)',
      iconoSvg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>'
    },
    {
      id: 'balance',
      nombre: 'Balance',
      badge: 'Balance Sheet',
      iconoSvg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>'
    },
    {
      id: 'cash-flows',
      nombre: 'Cash Flows',
      badge: 'Cash Flow Statement',
      iconoSvg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>'
    }
  ];

  const ANALISIS_IA_TABS = [
    {
      id: 'trimestral',
      nombre: 'Informe Trimestral (10-Q)',
      badge: 'Form 10-Q · Operativa & Dos Horizontes',
      iconoSvg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
    },
    {
      id: 'anual',
      nombre: 'Informe Anual (10-K)',
      badge: 'Form 10-K · Auditoría & Proyección Plurianual',
      iconoSvg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
    }
  ];

  function renderAvisoPanelContent() {
    return `
      <div class="guias-intro-wrap">
        <!-- 1. BLOQUE PRINCIPAL: DISCLAIMER / AVISO LEGAL -->
        <article class="guias-disclaimer-card" aria-label="Aviso de inversor particular y exención de responsabilidad">
          <div class="guias-disclaimer-header">
            <span class="guias-disclaimer-icon-wrap" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </span>
            <div>
              <span class="guias-disclaimer-badge">Aviso Legal & Transparencia</span>
              <h4>Aviso de Inversor Particular y Exención de Responsabilidad</h4>
            </div>
          </div>
          <div class="guias-disclaimer-body">
            <p>
              <strong>Soy un inversor particular:</strong> Cifra es un proyecto personal desarrollado de forma independiente con fines de estudio, formativos y de investigación particular. No soy una entidad financiera, sociedad de valores ni asesor financiero registrado.
            </p>
            <p>
              <strong>Cálculos y fórmulas:</strong> Puede ser que los cálculos y las fórmulas que utilice no sean las correctas o presenten variaciones respecto a las metodologías que aplican otros analistas, herramientas o instituciones. Toda la información, métricas y ajustes contables se presentan según criterios propios y deben considerarse únicamente orientativos.
            </p>
            <p>
              <strong>Sin recomendaciones ni responsabilidad:</strong> <strong>No me hago cargo de cualquier recomendación o análisis</strong> que aparezca en la web o sea producido por los modelos de IA. Ningún dato, resumen o cálculo aquí expuesto constituye una recomendación de compra, venta o asesoramiento financiero. Toda decisión de inversión que tomes es bajo tu exclusiva responsabilidad y riesgo; los mercados financieros conllevan riesgo real de pérdida patrimonial.
            </p>
          </div>
        </article>

        <!-- 2. ¿QUÉ OFRECE CIFRA? -->
        <section class="guias-section-card" aria-label="Herramientas y funcionalidades de Cifra">
          <div class="guias-section-title-wrap">
            <span class="scope-badge">Plataforma</span>
            <h3 class="guias-section-title">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              ¿Qué ofrece Cifra?
            </h3>
            <p class="guias-section-desc">Cifra pone a tu disposición herramientas especializadas para el seguimiento de tus inversiones y el estudio fundamental de compañías estadounidenses:</p>
          </div>

          <div class="guias-features-grid">
            <div class="guias-feature-card" data-target-section="cartera" role="button" tabindex="0" title="Ir a Cartera">
              <div class="guias-feature-head">
                <span class="guias-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h16v11H4zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                </span>
                <strong class="guias-feature-title">Seguimiento de Cartera</strong>
              </div>
              <p class="guias-feature-text">Registro de transacciones, cálculo de ponderaciones, diversificación por activo y control de rentabilidad neta.</p>
            </div>

            <div class="guias-feature-card" data-target-section="alertas" role="button" tabindex="0" title="Ir a Alertas">
              <div class="guias-feature-head">
                <span class="guias-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                </span>
                <strong class="guias-feature-title">Alertas de Precio</strong>
              </div>
              <p class="guias-feature-text">Configuración de avisos automáticos para monitorizar cotizaciones y recibir notificaciones cuando se alcancen niveles clave.</p>
            </div>

            <div class="guias-feature-card" data-target-section="calendario" role="button" tabindex="0" title="Ir a Calendario">
              <div class="guias-feature-head">
                <span class="guias-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>
                </span>
                <strong class="guias-feature-title">Calendario</strong>
              </div>
              <p class="guias-feature-text">Fechas estimadas y confirmadas de publicación de resultados trimestrales y anuales para planificar el seguimiento.</p>
            </div>

            <div class="guias-feature-card" data-target-section="informes" role="button" tabindex="0" title="Consultar Informes Trimestrales">
              <div class="guias-feature-head">
                <span class="guias-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5h10v14H7zM9 8h6M9 12h6"/></svg>
                </span>
                <strong class="guias-feature-title">Informes Trimestrales</strong>
              </div>
              <p class="guias-feature-text">Acceso directo a los filings oficiales 10-Q y 10-K presentados por las compañías ante la SEC estadounidense.</p>
            </div>

            <div class="guias-feature-card" data-target-section="datos" role="button" tabindex="0" title="Consultar Datos Financieros">
              <div class="guias-feature-head">
                <span class="guias-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
                </span>
                <strong class="guias-feature-title">Datos Financieros de EE.UU.</strong>
              </div>
              <p class="guias-feature-text">Cuentas de resultados, balances y estados de flujo de caja históricos normalizados de empresas cotizadas en EE.UU.</p>
            </div>
          </div>
        </section>

        <!-- 3. ANÁLISIS DE RESULTADOS CON IA EN INFORMES TRIMESTRALES -->
        <section class="guias-section-card guias-ia-panel" aria-label="Análisis de informes con Inteligencia Artificial">
          <div class="guias-section-title-wrap">
            <div class="guias-tag-row">
              <span class="scope-badge">Inteligencia Artificial</span>
              <span class="guias-mini-tag">10-Q · 10-K · SEC</span>
            </div>
            <h3 class="guias-section-title">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>
              Análisis de Resultados con IA en Informes Trimestrales
            </h3>
            <p class="guias-section-desc">En la pestaña de <strong>Informes trimestrales</strong> de cada empresa tienes la oportunidad de analizar en profundidad los resultados oficiales con modelos de IA.</p>
          </div>

          <div class="guias-ia-sectors-info">
            <div class="guias-info-callout">
              <div class="guias-info-callout-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </div>
              <div>
                <p>
                  <strong>Sector disponible actualmente:</strong> De momento se pueden analizar las empresas de <strong>consumo defensivo</strong> (Consumer Staples). La IA audita el volumen orgánico vs. precio/mix (pricing power), la sensibilidad a materias primas y empaques, la conversión real en flujo de caja libre (FCF) y la sostenibilidad del dividendo.
                </p>
                <p style="margin-top: 8px;">
                  <strong>Expansión a nuevos sectores:</strong> En el futuro estoy trabajando para que se puedan analizar empresas de diferentes sectores (tecnología, retail, industriales, salud, etc.), ajustando los prompts y la metodología a la realidad operativa de cada industria.
                </p>
              </div>
            </div>
          </div>

          <!-- Límites de IA y Reutilización de análisis (Caché compartida) -->
          <div class="guias-ia-quota-box">
            <h4 class="guias-ia-quota-title">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Límites de Uso y Análisis Compartidos
            </h4>
            <div class="guias-ia-quota-grid">
              <div class="guias-quota-card">
                <span class="guias-quota-badge">Cuota Diaria</span>
                <strong>Hasta 3 análisis al día</strong>
                <p>De momento cada usuario cuenta con hasta 3 análisis con IA al día para solicitar nuevos informes que aún no hayan sido analizados previamente.</p>
              </div>
              <div class="guias-quota-card highlight">
                <span class="guias-quota-badge highlight">Análisis Compartido</span>
                <strong>No consume tu cuota diaria</strong>
                <p>Si otro usuario ya le ha dado a analizar a un informe concreto, el siguiente que le dé a analizar a ese mismo informe <strong>no le va a contar</strong> en su límite de 3 al día, y le va a devolver al instante el mismo análisis que se ha hecho antes.</p>
              </div>
            </div>
          </div>
        </section>

        <!-- 4. FASE BETA, GRATIS Y DONACIONES -->
        <section class="guias-section-card guias-beta-card" aria-label="Fase beta y soporte al proyecto">
          <div class="guias-beta-content">
            <div class="guias-beta-header">
              <span class="scope-badge beta-badge">Fase Beta · 100% Gratuito</span>
              <h3>Proyecto en Fase Beta y Apoyo con Donaciones</h3>
            </div>
            <p class="guias-beta-text">
              De momento Cifra está en <strong>fase beta y absolutamente todo es gratis</strong>: el seguimiento de cartera, las alertas de precio, el calendario, los informes trimestrales, los datos financieros y los análisis con IA.
            </p>
            <div class="guias-beta-callout">
              <span class="guias-heart-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              </span>
              <p>
                Mantener los servidores, el procesamiento de datos de la SEC y las llamadas a las APIs de inteligencia artificial corre íntegramente por cuenta de un inversor particular. <strong>Las donaciones pueden ser la diferencia entre que siga adelante con este proyecto o no.</strong>
              </p>
            </div>
            <div class="guias-beta-action">
              <button type="button" class="guias-donate-action-btn" id="guias-donate-action-btn">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                <span>Apoyar a Cifra (Donar)</span>
              </button>
              <span class="guias-donate-subnote">Cualquier aportación ayuda directamente a sufragar los costes de servidores y APIs.</span>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderDatosFinancierosContent(activeTabId) {
    return `
      <div class="guias-df-wrap">
        <!-- Sub-navegación de 3 pestañas principales -->
        <nav class="guias-subnav-tabs" role="tablist" aria-label="Estados Financieros">
          ${DATOS_FINANCIEROS_TABS.map((tab) => `
            <button
              type="button"
              class="guias-subnav-tab ${activeTabId === tab.id ? 'active' : ''}"
              data-subtab="${escapeHtml(tab.id)}"
              role="tab"
              id="subtab-${escapeHtml(tab.id)}"
              aria-selected="${activeTabId === tab.id ? 'true' : 'false'}"
              aria-controls="guias-df-panel-${escapeHtml(tab.id)}"
            >
              ${tab.iconoSvg}
              <span>${escapeHtml(tab.nombre)}</span>
            </button>
          `).join('')}
        </nav>

        <!-- Contenedores de cada estado financiero -->
        <div class="guias-df-panels">
          <!-- 1. CUENTA DE RESULTADOS -->
          <div
            id="guias-df-panel-cuenta-resultados"
            class="guias-df-panel ${activeTabId === 'cuenta-resultados' ? 'active' : ''}"
            role="tabpanel"
            aria-labelledby="subtab-cuenta-resultados"
            ${activeTabId === 'cuenta-resultados' ? '' : 'hidden'}
          >
            <article class="guias-df-card">
              <header class="guias-df-header">
                <div class="guias-df-header-left">
                  <span class="scope-badge">Estado Financiero · Rendimiento</span>
                  <h3>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                    Cuenta de Resultados
                  </h3>
                  <span class="guias-df-en-title">Income Statement · Estado de Pérdidas y Ganancias (P&G)</span>
                </div>
              </header>

              <p class="guias-df-desc">
                La <strong>cuenta de resultados</strong> es el informe contable que sintetiza la actividad económica y comercial de la empresa durante un período determinado (un trimestre o un ejercicio anual completo). Refleja todos los ingresos obtenidos por la venta de productos o prestación de servicios y deduce sucesivamente los costes operativos, amortizaciones, gastos financieros e impuestos hasta llegar al resultado neto.
              </p>

              <div class="guias-df-grid">
                <div class="guias-df-box">
                  <h4>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    ¿Qué mide y cómo funciona?
                  </h4>
                  <p>Mide la rentabilidad económica bajo el <em>criterio de devengo contable</em>: los ingresos y gastos se contabilizan en el momento en que se adquiere el compromiso o se entrega el servicio, con independencia de cuándo se cobre o pague físicamente el dinero en la cuenta bancaria.</p>
                </div>

                <div class="guias-df-box">
                  <h4>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                    ¿Por qué le importa al inversor?
                  </h4>
                  <p>Permite evaluar el crecimiento orgánico de las ventas (<em>top-line</em>), el poder de fijación de precios mediante la evolución del margen bruto, la eficiencia operativa en costes de gestión (margen operativo) y el beneficio por acción (BPA/EPS) final que pertenece al accionista.</p>
                </div>
              </div>

              <!-- DESGLOSE DE LAS 9 LÍNEAS MÁS IMPORTANTES -->
              <div class="guias-lines-section">
                <div class="guias-lines-title-row">
                  <span class="scope-badge">Análisis Fundamental</span>
                  <h4>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                    Las 9 Líneas Más Importantes de la Cuenta de Resultados
                  </h4>
                  <p>Conceptos clave, cómo interpretarlos y las reglas de oro para analizarlos paso a paso:</p>
                </div>

                <div class="guias-lines-list">
                  <!-- LÍNEA 1: INGRESOS -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">01</span>
                        <h5>Ingresos <span class="guias-line-en-name">(Revenue / Sales / Top-Line)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Punto de Partida</span>
                    </div>
                    <p class="guias-line-desc">
                      Es la cifra total de dinero que factura la empresa por la venta de sus productos o la prestación de sus servicios antes de deducir cualquier gasto. Es el punto de partida absoluto de la cuenta de resultados (de ahí su denominación de <em>top-line</em>).
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Cómo analizarlo:</strong> Vigila si el crecimiento proviene de vender más unidades (volumen) o de subir precios (precio/mix). Un negocio de alta calidad es capaz de crecer en ingresos subiendo precios por encima de la inflación sin perder cuota de clientes (<em>pricing power</em>).
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 2: BENEFICIO BRUTO -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">02</span>
                        <h5>Beneficio Bruto <span class="guias-line-en-name">(Gross Profit)</span></h5>
                      </div>
                      <span class="guias-line-type-badge">Margen Operativo Base</span>
                    </div>
                    <p class="guias-line-desc">
                      Es el beneficio que queda tras restar a los ingresos el <strong>Coste de los Bienes Vendidos (COGS)</strong>, es decir, únicamente los costes directamente imputables a la fabricación del producto o aprovisionamiento del servicio (materias primas, envases y empaques, mano de obra directa de fábrica).
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                      <div>
                        <strong>Margen Bruto (Gross Margin = Beneficio Bruto / Ingresos):</strong> Es uno de los mejores termómetros de la ventaja competitiva (<em>moat</em>). Márgenes brutos elevados y estables año tras año demuestran que la empresa no necesita competir en una guerra destructiva de precios.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 3: GASTOS EN I+D -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">03</span>
                        <h5>Gastos en I+D <span class="guias-line-en-name">(Research & Development - R&D)</span></h5>
                      </div>
                      <span class="guias-line-type-badge">Inversión en Futuro</span>
                    </div>
                    <p class="guias-line-desc">
                      Son los recursos que la empresa destina a investigar, inventar y perfeccionar nuevos productos, tecnologías, software o formulaciones. Aunque la contabilidad obliga a restarlo como gasto del ejercicio, en la práctica económica actúa como una reinversión esencial para sostener el foso defensivo a largo plazo.
                    </p>
                    <div class="guias-line-rule-box">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>Cómo interpretarlo:</strong> Vital en tecnología, software y farmacia, y relevante en consumo para reformulaciones y empaques sostenibles. Un recorte repentino en I+D puede inflar artificialmente el beneficio a corto plazo, pero hipoteca el crecimiento futuro del negocio.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 4: AMORTIZACIÓN Y DETERIORO DE FONDOS DE COMERCIO Y ACTIVOS INTANGIBLES -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">04</span>
                        <h5>Amortización y Deterioro de Fondos de Comercio y Activos Intangibles <span class="guias-line-en-name">(Goodwill & Intangibles Impairment)</span></h5>
                      </div>
                      <span class="guias-line-type-badge non-cash">Apunte No Monetario</span>
                    </div>
                    <p class="guias-line-desc">
                      Registra la depreciación o pérdida de valor contable de marcas, patentes, licencias y fondos de comercio (el sobreprecio pagado al comprar empresas pasadas). <strong>Es crucial entender que este apunte NO representa una salida de dinero real de la caja.</strong>
                    </p>
                    <div class="guias-line-rule-box amber">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>Ejemplo práctico:</strong> Supongamos que una empresa compra un competidor creyendo que la Marca A valía 3.000 millones de euros. Si tras un año el mercado cambia y los auditores dictaminan que ahora solo vale 2.000 millones, la empresa debe anotar un deterioro de 1.000 millones en la cuenta de resultados. <em>Ese dinero no sale de la cuenta bancaria hoy</em> (ya se pagó en el pasado); es únicamente un ajuste contable que reduce el beneficio reportado sin drenar la caja actual.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 5: BENEFICIO OPERATIVO Y OPERATIVO AJUSTADO -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">05</span>
                        <h5>Beneficio Operativo (EBIT) y Beneficio Operativo Ajustado <span class="guias-line-en-name">(Operating Income / Adjusted EBIT)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Rentabilidad del Negocio</span>
                    </div>
                    <p class="guias-line-desc">
                      El <strong>Beneficio Operativo (EBIT)</strong> mide lo que genera la compañía puramente con su actividad industrial y comercial cotidiana, antes de atender pagos de deuda e impuestos. Es el resultado de restar a los ingresos los costes de ventas, I+D y gastos generales y de administración (SG&A).
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                      <div>
                        <strong>¿Por qué calculamos el Beneficio Operativo Ajustado?</strong> Porque ajustamos <em>justamente</em> las partidas extraordinarias y no monetarias, como los deterioros de fondos de comercio e intangibles explicados arriba. Al sumar de vuelta esos deterioros contables (que no tocaron la caja), obtenemos la rentabilidad operativa real y recurrente para comparar con precisión los resultados año a año.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 6: GASTOS POR INTERESES -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">06</span>
                        <h5>Gastos por Intereses <span class="guias-line-en-name">(Interest Expense)</span></h5>
                      </div>
                      <span class="guias-line-type-badge warning">Carga de Deuda</span>
                    </div>
                    <p class="guias-line-desc">
                      Es el coste financiero que la empresa abona a las entidades bancarias y a los tenedores de bonos por la deuda contraída. Representa la carga periódica que impone el apalancamiento financiero sobre los resultados del negocio.
                    </p>
                    <div class="guias-line-rule-box red">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <div>
                        <strong>Regla de oro de solvencia:</strong> Como norma prudente de inversión, <strong>debemos evitar negocios donde los gastos por intereses superen el 20% del beneficio operativo</strong> (<code>Intereses / EBIT &gt; 20%</code>). Si una compañía destina más de una quinta parte de lo que gana operativamente solo a pagar intereses, queda en una situación vulnerable ante subidas de tipos de interés o caídas temporales de ventas.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 7: DEVALUACIÓN DE ACTIVOS TANGIBLES -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">07</span>
                        <h5>Devaluación de Activos <span class="guias-line-en-name">(Tangible Asset Impairment)</span></h5>
                      </div>
                      <span class="guias-line-type-badge non-cash">Ajuste Físico No Monetario</span>
                    </div>
                    <p class="guias-line-desc">
                      Es un concepto completamente análogo al deterioro de intangibles, pero aplicado a <strong>activos físicos y tangibles</strong>: fábricas cerradas antes de tiempo, maquinaria obsoleta, inmuebles que pierden valor de mercado o inventarios defectuosos que deben rebajarse o liquidarse con pérdidas.
                    </p>
                    <div class="guias-line-rule-box amber">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>Impacto real:</strong> Al igual que con los intangibles, este apunte reduce el beneficio neto en la cuenta de resultados, pero <em>tampoco supone una salida de efectivo en ese momento</em>. En Cifra se aísla este impacto para entender la rentabilidad continua de los activos que permanecen productivos.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 8: EBT (BENEFICIO ANTES DE IMPUESTOS) -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">08</span>
                        <h5>EBT - Beneficio Antes de Impuestos <span class="guias-line-en-name">(Earnings Before Taxes)</span></h5>
                      </div>
                      <span class="guias-line-type-badge">Base Imponible</span>
                    </div>
                    <p class="guias-line-desc">
                      Es la ganancia que produce la empresa una vez atendidos todos los costes operativos, depreciaciones y gastos de deuda (EBIT menos intereses netos), justo antes de liquidar el impuesto sobre beneficios con la administración tributaria.
                    </p>
                    <div class="guias-line-rule-box">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>Utilidad analítica:</strong> El EBT es la magnitud más limpia para comparar empresas de un mismo sector sujetas a distintas legislaciones fiscales o con deducciones tributarias diferentes, aislando el negocio de la carga impositiva.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 9: BENEFICIO NETO E IMPUESTOS -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">09</span>
                        <h5>Beneficio Neto <span class="guias-line-en-name">(Net Income / Bottom-Line)</span> e Impuestos</h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Línea Final del Accionista</span>
                    </div>
                    <p class="guias-line-desc">
                      Es la última línea de la cuenta de resultados (<em>bottom-line</em>): la ganancia final atribuible a los accionistas de la empresa tras deducir los impuestos corporativos del EBT (<code>Beneficio Neto = EBT - Impuestos</code>). A partir de ella se calcula el Beneficio por Acción (BPA / EPS) dividiendo entre el número de acciones en circulación.
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Regla de los impuestos:</strong> En empresas estadounidenses y europeas, los impuestos corporativos reales <strong>suelen rondar habitualmente entre el 20% y el 25% del EBT</strong> (la tasa federal estándar de EE.UU. es del 21% más tributos estatales). Si en un año ves que una empresa paga un 5% o un 40%, suele deberse a créditos fiscales temporales, repatriación de beneficios o litigios contables extraordinarios que distorsionan el beneficio neto real.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <!-- 2. BALANCE DE SITUACIÓN -->
          <div
            id="guias-df-panel-balance"
            class="guias-df-panel ${activeTabId === 'balance' ? 'active' : ''}"
            role="tabpanel"
            aria-labelledby="subtab-balance"
            ${activeTabId === 'balance' ? '' : 'hidden'}
          >
            <article class="guias-df-card">
              <header class="guias-df-header">
                <div class="guias-df-header-left">
                  <span class="scope-badge">Estado Financiero · Solvencia</span>
                  <h3>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>
                    Balance de Situación
                  </h3>
                  <span class="guias-df-en-title">Balance Sheet · Estado de Posición Financiera</span>
                </div>
              </header>

              <p class="guias-df-desc">
                El <strong>balance de situación</strong> es una «fotografía fija» de la salud patrimonial y financiera de la compañía en un instante concreto (a fecha de cierre del trimestre o del año fiscal). Detalla con total precisión qué recursos e inversiones posee la empresa y cómo han sido financiados, ya sea mediante deuda con terceros o con fondos propios de los accionistas.
              </p>

              <div class="guias-df-grid">
                <div class="guias-df-box">
                  <h4>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    Activos vs. Pasivos vs. Fondos Propios
                  </h4>
                  <p>Se asienta sobre la regla de oro contable: <strong>Activo = Pasivo + Fondos Propios</strong>. Los <em>Activos</em> son los recursos económicos e inversiones en manos de la empresa (caja, clientes, inventarios, fábricas, marcas). Los <em>Pasivos</em> son las obligaciones frente a terceros (deuda bancaria, bonos, proveedores). Los <em>Fondos Propios (Patrimonio Neto)</em> representan el valor neto residual que pertenece a los accionistas (<code>Fondos Propios = Activos - Pasivos</code>).</p>
                </div>

                <div class="guias-df-box">
                  <h4>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Corriente (Corto Plazo) vs. Total (Largo Plazo)
                  </h4>
                  <p>La distinción temporal es vital: lo <strong>Corriente o Circulante</strong> agrupa activos y pasivos que se convertirán en liquidez o deberán pagarse en <strong>menos de 1 año</strong> (caja, clientes, stock, vencimientos de deuda a corto plazo). Mide la liquidez del día a día. Lo <strong>No Corriente / Total</strong> agrupa inversiones permanentes y obligaciones a <strong>más de 1 año</strong> (inmovilizado, marcas, deuda a largo plazo), definiendo la estructura financiera estratégica del negocio.</p>
                </div>
              </div>

              <!-- DESGLOSE DE LAS LÍNEAS CLAVE DEL BALANCE -->
              <div class="guias-lines-section">
                <div class="guias-lines-title-row">
                  <span class="scope-badge">Análisis Patrimonial</span>
                  <h4>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>
                    Las Líneas Clave del Balance de Situación
                  </h4>
                  <p>Activos, pasivos, capital circulante y métricas de solvencia para evaluar la solidez del negocio:</p>
                </div>

                <div class="guias-lines-list">
                  <!-- LÍNEA 1: EFECTIVO Y EQUIVALENTES -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">01</span>
                        <h5>Efectivo y Equivalentes <span class="guias-line-en-name">(Cash & Cash Equivalents)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Liquidez Inmediata</span>
                    </div>
                    <p class="guias-line-desc">
                      Es el dinero líquido disponible en cuentas bancarias corrientes, depósitos a la vista e instrumentos del mercado monetario ultraseguros a muy corto plazo (como letras del tesoro estadounidense o T-Bills a 3 meses) que pueden transformarse en efectivo de inmediato.
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>El oxígeno del negocio:</strong> Constituye la máxima garantía de supervivencia frente a recesiones. Una posición de caja sólida permite operar sin el agobio de depender del crédito bancario y aprovechar periodos de pánico en bolsa para adquirir competidores o recomprar acciones a precios de derribo.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 2: CUENTAS POR COBRAR -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">02</span>
                        <h5>Cuentas por Cobrar <span class="guias-line-en-name">(Accounts Receivable / Clientes)</span></h5>
                      </div>
                      <span class="guias-line-type-badge">Derechos de Cobro</span>
                    </div>
                    <p class="guias-line-desc">
                      Son ventas de productos o servicios que la empresa ya ha entregado y facturado, pero cuyo dinero aún no ha entrado en la cuenta del banco porque los clientes disfrutan de un plazo para pagar acordado ("mis clientes me dicen: <em>«ya te pagaré en 30, 60, 90 días o en 1 año»</em>").
                    </p>
                    <div class="guias-line-rule-box amber">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>Alerta de cobro y calidad de ventas:</strong> Si las cuentas por cobrar crecen mucho más rápido que los ingresos, suele indicar que la compañía está relajando sus condiciones crediticias para inflar ventas contables con clientes poco solventes, disparando el riesgo de impagos y morosidad.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 3: INVENTARIO -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">03</span>
                        <h5>Inventario <span class="guias-line-en-name">(Inventory / Existencias)</span></h5>
                      </div>
                      <span class="guias-line-type-badge non-cash">Bienes Almacenados</span>
                    </div>
                    <p class="guias-line-desc">
                      Es el conjunto de materias primas, productos en curso de fabricación y artículos terminados almacenados a la espera de ser vendidos y entregados al cliente final. Un ejemplo clásico: <strong>los almacenes de NIKE repletos de cajas de zapatillas</strong> esperando a ser enviadas a tiendas o distribuidores.
                    </p>
                    <div class="guias-line-rule-box amber">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>Dinero inmovilizado y riesgo de pérdida:</strong> El inventario es capital congelado que no devenga intereses en el banco, genera costes continuos de alquiler de almacén, seguros y refrigeración, y corre el peligro de pasar de moda o devaluarse, obligando a provisionar pérdidas o liquidar con descuentos agresivos.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 4: CUENTAS POR PAGAR -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">04</span>
                        <h5>Cuentas por Pagar <span class="guias-line-en-name">(Accounts Payable / Proveedores)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Financiación Comercial</span>
                    </div>
                    <p class="guias-line-desc">
                      Es el reverso directo de las cuentas por cobrar: facturas que la empresa tiene pendientes de abonar a sus suministradores de materias primas, envases o servicios ya recibidos ("aquí yo soy el cliente y le debo dinero a mi proveedor a 30, 60 o 90 días").
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Financiación gratuita al 0% de interés:</strong> Constituye el pasivo más ventajoso posible porque no devenga intereses bancarios. Un negocio con fuerte poder de negociación frente a proveedores puede financiarse gratis pagando a 90 o 120 días mientras cobra al contado de sus propios clientes.
                      </div>
                    </div>
                  </div>

                  <!-- MÓDULO EDUCATIVO DESTACADO: EL IMPACTO EN EL CIRCULANTE Y LA INFLACIÓN -->
                  <div class="guias-circulante-section">
                    <div class="guias-circulante-header">
                      <div class="guias-circulante-title-wrap">
                        <span class="guias-line-number" style="background: rgba(79, 70, 229, 0.15);">★</span>
                        <h5>Cuentas por Cobrar, Inventario y Cuentas por Pagar: El Ciclo del Circulante</h5>
                      </div>
                      <span class="scope-badge">Caso Práctico Fundamental</span>
                    </div>
                    <p class="guias-line-desc" style="margin-bottom: 8px;">
                      Estas tres partidas determinan el <strong>Capital Circulante Operativo</strong> (también conocido como <em>Necesidades Operativas de Fondos o NOF</em>). Es el dinero neto que el negocio necesita mantener atrapado en el día a día solo para poder operar:
                    </p>
                    <div style="font-size: 13px; font-weight: 700; color: var(--ink); margin-bottom: 12px;">
                      <code>Capital Circulante Operativo = Cuentas por Cobrar + Inventarios - Cuentas por Pagar</code>
                    </div>

                    <div class="guias-circulante-calc-grid">
                      <div class="guias-circulante-item">
                        <span class="guias-circulante-item-label">Cuentas por Cobrar</span>
                        <span class="guias-circulante-item-val plus">+3.000M</span>
                        <span class="guias-circulante-item-sub">Clientes nos deben dinero</span>
                      </div>
                      <div class="guias-circulante-item">
                        <span class="guias-circulante-item-label">Inventarios (Nike)</span>
                        <span class="guias-circulante-item-val plus">+8.000M</span>
                        <span class="guias-circulante-item-sub">Zapatillas en almacén</span>
                      </div>
                      <div class="guias-circulante-item">
                        <span class="guias-circulante-item-label">Cuentas por Pagar</span>
                        <span class="guias-circulante-item-val minus">-1.000M</span>
                        <span class="guias-circulante-item-sub">Financiación proveedores</span>
                      </div>
                      <div class="guias-circulante-item" style="border-color: var(--accent);">
                        <span class="guias-circulante-item-label">Resultado Neto Circulante</span>
                        <span class="guias-circulante-item-val total">10.000M</span>
                        <span class="guias-circulante-item-sub">Capital neto inmovilizado</span>
                      </div>
                    </div>

                    <div class="guias-circulante-answer-box">
                      <div class="guias-circulante-answer-badge">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                        Afirmación Verificada: 100% Correcta
                      </div>
                      <p style="margin: 0 0 8px 0;">
                        <strong>¿Tu afirmación es correcta? Sí, es matemáticamente exacta y una de las lecciones más valiosas del análisis fundamental.</strong>
                      </p>
                      <p style="margin: 0 0 6px 0;">
                        <strong>1. Con una inflación del 10% (precios más altos):</strong> Aunque vendas el mismo número de zapatillas, todos los importes se encarecen un 10%:
                      </p>
                      <ul style="margin: 0 0 10px 18px; padding: 0; font-size: 12.5px; line-height: 1.6;">
                        <li>Las <strong>cuentas por cobrar</strong> pasan de 3.000M a 3.300M (requieren <strong>+300M</strong> adicionales atados en facturas de clientes).</li>
                        <li>Los <strong>inventarios</strong> pasan de 8.000M a 8.800M (requieren <strong>+800M</strong> adicionales para reponer el mismo stock a costes más altos).</li>
                        <li>Las <strong>cuentas por pagar</strong> pasan de 1.000M a 1.100M (los proveedores nos financian <strong>+100M</strong> adicionales).</li>
                      </ul>
                      <p style="margin: 0 0 10px 0;">
                        <strong>El impacto neto de caja a financiar:</strong> <code>+300M + +800M - +100M = +1.000M</code> (exactamente <code>10.000M × 10% = 1.000M</code>).
                      </p>
                      <p style="margin: 0 0 6px 0;">
                        <strong>2. Ocurre exactamente lo mismo cuando crecemos en volúmenes (+10% en unidades vendidas):</strong>
                      </p>
                      <p style="margin: 0 0 8px 0; font-size: 12.5px; line-height: 1.6;">
                        Si Nike quiere vender un 10% más de zapatillas físicas, no basta con desearlo: necesita fabricar físicamente un 10% más de pares para llenar sus estanterías y almacenes sin sufrir roturas de stock (<strong>+800M</strong> en inventario físico), concede crédito comercial sobre un 10% más de pedidos a tiendas asociadas (<strong>+300M</strong> en clientes) y sus proveedores de suelas y tejidos le financian el 10% correspondiente (<strong>+100M</strong> en proveedores). El resultado neto es exactamente el mismo: <strong>la empresa tiene que poner de su bolsillo 1.000M de caja real para financiar ese crecimiento de volumen</strong>.
                      </p>
                      <p style="margin: 0; font-weight: 500;">
                        <strong>La gran lección de Warren Buffett:</strong> Tanto la inflación como el crecimiento en volúmenes <strong>consumen efectivo</strong> en empresas con alto circulante positivo. De hecho, una empresa puede «morir de éxito» si crece en ventas demasiado rápido sin tener caja para financiar el stock y las facturas pendientes. Por el contrario, los negocios con <em>circulante negativo</em> (cobran al contado y pagan a 90 días, como Amazon o Inditex) generan más dinero en el banco cada vez que venden más unidades o suben precios.
                      </p>
                    </div>
                  </div>

                  <!-- LÍNEA 5: FONDO DE COMERCIO E INTANGIBLES -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">05</span>
                        <h5>Fondo de Comercio e Intangibles <span class="guias-line-en-name">(Goodwill & Intangible Assets)</span></h5>
                      </div>
                      <span class="guias-line-type-badge non-cash">Activos No Físicos</span>
                    </div>
                    <p class="guias-line-desc">
                      Engloba los activos inmateriales protegidos por ley (marcas comerciales, patentes tecnológicas o farmacéuticas, licencias y software) y el <strong>Fondo de Comercio (Goodwill)</strong>, que es el sobreprecio pagado al adquirir otra empresa por encima del valor contable neto de sus activos tangibles.
                    </p>
                    <div class="guias-line-rule-box amber">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>Supervisión de compras pasadas:</strong> Si el negocio adquirido no genera los beneficios previstos, la directiva está obligada a registrar un deterioro contable (<em>impairment</em>), castigando el beneficio neto en la cuenta de resultados (tal como vimos en la línea 04 de la cuenta de resultados) sin implicar salida adicional de efectivo en ese ejercicio.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 6: INMOVILIZADO MATERIAL BRUTO -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">06</span>
                        <h5>Inmovilizado Material Bruto <span class="guias-line-en-name">(Gross Property, Plant & Equipment - Gross PP&E)</span></h5>
                      </div>
                      <span class="guias-line-type-badge">Coste Histórico Tangible</span>
                    </div>
                    <p class="guias-line-desc">
                      Es el valor de adquisición original acumulado de todos los activos físicos y tangibles de la compañía: terrenos, plantas de producción, fábricas, maquinaria pesada, tiendas físicas y flotas de transporte, antes de aplicar la amortización contable acumulada (Inmovilizado Neto).
                    </p>
                    <div class="guias-line-rule-box">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>Intensidad de capital histórica:</strong> Permite comprobar cuánto dinero físico bruto ha necesitado desplegar la compañía a lo largo de su trayectoria. Si el inmovilizado bruto crece a tasas anuales elevadas sin un crecimiento equivalente en ventas o EBIT, el retorno sobre el capital invertido (ROIC) tiende a erosionarse.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 7: INVERSIONES A LARGO PLAZO -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">07</span>
                        <h5>Inversiones a Largo Plazo <span class="guias-line-en-name">(Long-Term Investments)</span></h5>
                      </div>
                      <span class="guias-line-type-badge">Cartera Estratégica</span>
                    </div>
                    <p class="guias-line-desc">
                      Activos financieros que la compañía planea mantener en balance con un horizonte superior a 12 meses: participaciones en empresas asociadas o filiales no consolidadas, títulos de renta fija a largo plazo o carteras de acciones cotizadas (como la célebre cartera de acciones de Berkshire Hathaway).
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Rentas y plusvalías:</strong> Aportan ingresos no operativos regulares vía dividendos o intereses y representan una bolsa de liquidez secundaria si la dirección decide desinvertir en un momento oportuno.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 8: PRÉSTAMOS A CORTO PLAZO -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">08</span>
                        <h5>Préstamos y Deuda a Corto Plazo <span class="guias-line-en-name">(Short-Term Debt & Current Portion)</span></h5>
                      </div>
                      <span class="guias-line-type-badge warning">Vencimiento &lt; 1 Año</span>
                    </div>
                    <p class="guias-line-desc">
                      Compromisos financieros exigibles en los próximos 12 meses: líneas de crédito bancarias dispuestas, pagarés de empresa (<em>commercial paper</em>) y la porción exacta de la deuda a largo plazo que vence dentro del ejercicio contable actual.
                    </p>
                    <div class="guias-line-rule-box red">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <div>
                        <strong>Riesgo de liquidez y refinanciación:</strong> Debe vigilarse directamente frente al efectivo y equivalentes disponibles. Si la deuda a corto plazo supera a la caja y el negocio no genera suficiente flujo operativo, la empresa depende del beneplácito de los bancos para renovar las pólizas o se arriesga a un estrangulamiento de liquidez.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 9: DEUDA A LARGO PLAZO -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">09</span>
                        <h5>Deuda a Largo Plazo <span class="guias-line-en-name">(Long-Term Debt)</span></h5>
                      </div>
                      <span class="guias-line-type-badge warning">Endeudamiento Estructural</span>
                    </div>
                    <p class="guias-line-desc">
                      Financiación bancaria formal y emisiones de bonos corporativos con vencimiento superior a 12 meses. Constituye la espina dorsal del apalancamiento financiero con el que la empresa financia sus proyectos de expansión y adquisiciones.
                    </p>
                    <div class="guias-line-rule-box">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>Estructura y tipos de interés:</strong> Es fundamental revisar en las notas del balance si la deuda está emitida a tipo de interés fijo o variable, así como el calendario de vencimientos plurianual (<em>debt maturity profile</em>) para evitar concentraciones de deuda en años difíciles.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 10: FONDOS PROPIOS / PATRIMONIO NETO -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">10</span>
                        <h5>Fondos Propios <span class="guias-line-en-name">(Shareholders' Equity / Patrimonio Neto)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Valor Contable del Accionista</span>
                    </div>
                    <p class="guias-line-desc">
                      Es el valor neto contable residual que pertenecería a los accionistas si se liquidaran todos los activos y se pagaran todos los pasivos (<code>Fondos Propios = Activo Total - Pasivo Total</code>). Está integrado por el capital desembolsado por los socios y todas las reservas y beneficios acumulados retenidos en la compañía a lo largo de su historia.
                    </p>
                    <div class="guias-line-rule-box amber">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>La paradoja de los fondos propios negativos:</strong> Compañías con extraordinario poder de fijación de precios y mínimo requerimiento de activos físicos (como McDonald's, Starbucks, AutoZone o Domino's) muestran frecuentemente fondos propios negativos. Esto no significa quiebra, sino que han generado tanto flujo de caja que han recomprado miles de millones en acciones propias a cotizaciones de mercado muy superiores a su valor nominal.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 11: DEUDA NETA -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">11</span>
                        <h5>Deuda Neta <span class="guias-line-en-name">(Net Debt)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Métrica Maestra de Solvencia</span>
                    </div>
                    <p class="guias-line-desc">
                      Es la magnitud definitiva para calibrar el apalancamiento financiero real de la empresa: <code>Deuda Financiera Total (Corto Plazo + Largo Plazo) - Efectivo y Equivalentes</code>.
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Interpretación de solvencia:</strong>
                        <ul style="margin: 4px 0 0 16px; padding: 0; line-height: 1.55;">
                          <li><strong>Si es negativa (Caja Neta):</strong> La empresa tiene más efectivo en el banco que toda su deuda financiera junta. Es la posición de máxima solvencia e inmunidad ante crisis económicas.</li>
                          <li><strong>Si es positiva:</strong> La deuda debe contrastarse con la capacidad de generar beneficios mediante los ratios <code>Deuda Neta / EBITDA</code> o <code>Deuda Neta / FCF</code> (como regla prudente, preferiblemente por debajo de 2,5x - 3,0x).</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <!-- 3. CASH FLOWS (ESTADO DE FLUJOS DE EFECTIVO) -->
          <div
            id="guias-df-panel-cash-flows"
            class="guias-df-panel ${activeTabId === 'cash-flows' ? 'active' : ''}"
            role="tabpanel"
            aria-labelledby="subtab-cash-flows"
            ${activeTabId === 'cash-flows' ? '' : 'hidden'}
          >
            <article class="guias-df-card">
              <header class="guias-df-header">
                <div class="guias-df-header-left">
                  <span class="scope-badge">Estado Financiero · Caja Real</span>
                  <h3>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
                    Cash Flows (Flujos de Caja)
                  </h3>
                  <span class="guias-df-en-title">Cash Flow Statement · Estado de Flujos de Efectivo</span>
                </div>
              </header>

              <p class="guias-df-desc">
                El <strong>estado de flujos de efectivo (Cash Flows)</strong> registra el movimiento real de dinero que entra y sale de las cuentas de la empresa durante el período. Elimina todos los artificios y provisiones contables no monetarias de la cuenta de resultados, permitiendo verificar si los beneficios contables se traducen en dinero físico contante y sonante.
              </p>

              <div class="guias-df-grid">
                <div class="guias-df-box">
                  <h4>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    Las tres actividades del flujo de caja
                  </h4>
                  <p>Se divide en tres ramas imprescindibles: <strong>Operativo (CFO)</strong> (caja generada por la venta del producto o servicio y cobro de clientes), <strong>Inversión (CFI)</strong> (dinero invertido en maquinaria, tecnología y plantas —<em>CAPEX</em>— o adquisiciones) y <strong>Financiación (CFF)</strong> (pagos de dividendos, amortización de deuda y recompra de acciones).</p>
                </div>

                <div class="guias-df-box">
                  <h4>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    ¿Por qué es la métrica reina del inversor?
                  </h4>
                  <p>Porque <em>«el beneficio es una opinión, pero la caja es un hecho»</em>. Al restar el CAPEX del Flujo Operativo obtenemos el <strong>Flujo de Caja Libre (Free Cash Flow o FCF)</strong>: el dinero real sobrante para retribuir al accionista, recomprar acciones, reducir deuda o realizar adquisiciones estratégicas sin comprometer el negocio.</p>
                </div>
              </div>

              <!-- DESGLOSE DE LAS 7 LÍNEAS CLAVE DE LOS CASH FLOWS -->
              <div class="guias-lines-section">
                <div class="guias-lines-title-row">
                  <span class="scope-badge">Análisis de Liquidez Real</span>
                  <h4>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
                    Las Líneas Clave de los Flujos de Caja
                  </h4>
                  <p>Partidas esenciales del flujo operativo, inversiones de capital y asignación del dinero al accionista:</p>
                </div>

                <div class="guias-lines-list">
                  <!-- LÍNEA 1: COMPENSACIÓN EN STOCK OPTIONS -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">01</span>
                        <h5>Compensación en Stock Options <span class="guias-line-en-name">(Stock-Based Compensation - SBC)</span></h5>
                      </div>
                      <span class="guias-line-type-badge warning">Gasto No Monetario Dilutivo</span>
                    </div>
                    <p class="guias-line-desc">
                      Es la remuneración a directivos y empleados mediante opciones sobre acciones o paquetes de títulos restringidos (RSUs). En la cuenta de resultados se resta como un gasto operativo más; sin embargo, en el estado de flujos de caja <strong>se suma de vuelta al flujo de caja operativo (CFO)</strong> con el argumento de que en ese ejercicio no ha salido dinero contante de la cuenta bancaria.
                    </p>
                    <div class="guias-line-rule-box red">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <div>
                        <strong>La trampa de la dilución y el ajuste conservador (+20%):</strong> Aunque no salga dinero de la caja hoy, <strong>está diluyendo directamente nuestras acciones</strong>: cada año se emiten nuevos títulos que reducen nuestra participación en la empresa. Además, las stock options se conceden con un descuento respecto a la cotización real de mercado. Por ello, para realizar un análisis de valoración conservador y realista, <strong>es altamente recomendable ajustar e incluso añadir un 20% sobre lo que figura en esa línea</strong> (o deducirlo directamente del Free Cash Flow) para imputar el coste económico real que soporta el accionista por la dilución.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 2: CAMBIO EN EL CIRCULANTE -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">02</span>
                        <h5>Cambio en el Capital Circulante <span class="guias-line-en-name">(Change in Working Capital)</span></h5>
                      </div>
                      <span class="guias-line-type-badge">Ajuste Operativo de Liquidez</span>
                    </div>
                    <p class="guias-line-desc">
                      Refleja el impacto directo en la caja de la variación neta de las cuentas por cobrar, inventarios y cuentas por pagar entre el inicio y el fin del período (el ciclo del circulante que analizamos en el balance). Si los clientes tardan más en pagar o se acumula stock de zapatillas Nike en almacén, esta línea drena caja (signo negativo); si los proveedores financian más compras o se cobra a tiempo, libera efectivo (signo positivo).
                    </p>
                    <div class="guias-line-rule-box amber">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>No es estático: normalizar valores atípicos:</strong> Esta partida no es lineal ni fija; sufre oscilaciones bruscas debido a estacionalidad comercial, picos de aprovisionamiento preventivo o fluctuaciones de precios. <strong>Si en un año determinado muestra un valor anormal o fuera de lo común, se debe ajustar y normalizar</strong> para no proyectar distorsiones transitorias como si fueran la capacidad estructural de generación de caja del negocio.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 3: EFECTIVO DE OPERACIONES -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">03</span>
                        <h5>Efectivo de las Operaciones <span class="guias-line-en-name">(Cash Flow from Operations - CFO)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Caja Operativa Bruta</span>
                    </div>
                    <p class="guias-line-desc">
                      Es el dinero líquido real que entra en la cuenta bancaria de la empresa derivado exclusivamente de su actividad de explotación central tras cobrar a clientes, pagar suministros a proveedores, salarios e impuestos. Parte del beneficio neto contable, le suma de vuelta amortizaciones, deterioros y SBC, y le aplica el cambio neto en el circulante.
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>El termómetro de la verdad:</strong> A diferencia del beneficio neto (que puede moldearse con criterios de devengo contable agresivos), el CFO demuestra si el modelo comercial genera efectivo tangible. Constituye la base indispensable antes de acometer inversiones en activos o retribuir a los accionistas.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 4: CAPEX -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">04</span>
                        <h5>CAPEX - Inversiones de Capital <span class="guias-line-en-name">(Capital Expenditures / PP&E Purchases)</span></h5>
                      </div>
                      <span class="guias-line-type-badge">Inversión en Capacidad Física</span>
                    </div>
                    <p class="guias-line-desc">
                      Es el efectivo desembolsado en la adquisición, modernización y ampliación de activos materiales y productivos: plantas industriales, maquinaria pesada, flota logística, tiendas físicas o infraestructura de servidores.
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Mantenimiento vs. Crecimiento y la regla de oro del analista:</strong>
                        <ul style="margin: 6px 0 6px 16px; padding: 0; line-height: 1.6;">
                          <li><strong>CAPEX de Mantenimiento:</strong> El dinero imprescindible para sustituir maquinaria desgastada y mantener la cuota competitiva del negocio intacta sin menguar su tamaño.</li>
                          <li><strong>CAPEX de Crecimiento:</strong> Inversión voluntaria destinada a abrir nuevas tiendas, duplicar fábricas o expandirse a nuevos mercados geográficos.</li>
                          <li><strong>La realidad contable en la SEC:</strong> En la gran mayoría de informes 10-K y 10-Q las compañías <em>no desglosan</em> qué importe es de mantenimiento y cuál de crecimiento, agrupándolo todo en una sola partida genérica.</li>
                          <li><strong>Fórmula de estimación práctica:</strong> Normalmente el CAPEX de mantenimiento suele aproximarse a:
                            <div style="margin: 6px 0; font-weight: 700; color: var(--ink);">
                              <code>CAPEX Mantenimiento ≈ Depreciaciones y Amortizaciones × (1 + Inflación)</code>
                            </div>
                            Dado que reponer hoy un activo amortizado adquirido hace años resulta más costoso por la inflación acumulada, todo desembolso que supere este umbral puede considerarse de forma prudente como inversión en crecimiento.
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 5: ADQUISICIONES -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">05</span>
                        <h5>Adquisiciones <span class="guias-line-en-name">(Acquisitions / M&A Cash Outflow)</span></h5>
                      </div>
                      <span class="guias-line-type-badge non-cash">Crecimiento Inorgánico</span>
                    </div>
                    <p class="guias-line-desc">
                      Es la salida de dinero en el Flujo de Inversión (CFI) destinada a la compra de otras empresas competidoras, líneas de producto completas o carteras de patentes externas.
                    </p>
                    <div class="guias-line-rule-box amber">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>Riesgo de sobreprecio y creación de Goodwill:</strong> Las adquisiciones suelen implicar grandes salidas de efectivo y generan Fondo de Comercio en el balance. Con frecuencia, pagar múltiplos inflados por empresas ajenas destruye valor para el accionista si las sinergias proyectadas no se cumplen en la realidad.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 6: RECOMPRAS DE ACCIONES -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">06</span>
                        <h5>Recompras de Acciones <span class="guias-line-en-name">(Share Repurchases / Buybacks)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Retribución al Accionista</span>
                    </div>
                    <p class="guias-line-desc">
                      Es la salida de caja dentro del Flujo de Financiación (CFF) en la que la compañía acude a la bolsa para comprar sus propios títulos con el dinero de la tesorería y amortizarlos (destruirlos definitivamente).
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>¿Qué son y qué efecto producen en tu inversión?</strong>
                        Al eliminar acciones del mercado, el pastel total del negocio se reparte entre menos porciones. Como consecuencia, <strong>cada acción que tú mantienes pasa a poseer un porcentaje mayor de las ventas, los beneficios y los dividendos futuros</strong> (incrementando automáticamente el Beneficio por Acción o BPA sin necesidad de que la empresa venda más).
                        <br><br>
                        <em>Matiz fundamental:</em> Solo generan valor real si la directiva las ejecuta cuando la acción cotiza por debajo de su valor intrínseco o a precios razonables. Si la empresa recompra a valoraciones de burbuja o las usa simplemente para neutralizar la dilución de las Stock Options de los directivos, está quemando la caja del accionista.
                      </div>
                    </div>
                  </div>

                  <!-- LÍNEA 7: DIVIDENDOS -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">07</span>
                        <h5>Dividendos Pagados <span class="guias-line-en-name">(Dividends Paid)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Reparto Directo de Efectivo</span>
                    </div>
                    <p class="guias-line-desc">
                      Es el desembolso líquido en el Flujo de Financiación mediante el cual la empresa transfiere efectivo directamente desde su cuenta bancaria hacia las cuentas corrientes de los accionistas como recompensa periódica por su capital invertido.
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Prueba de fuego de sostenibilidad:</strong> El dividendo es la prueba irrefutable de que los beneficios existen en dinero real. Sin embargo, debe estar holgadamente respaldado por el <strong>Flujo de Caja Libre (FCF)</strong> orgánico (ratio de reparto razonable <code>Dividendos / FCF &lt; 60%-70%</code>). Si una empresa reparte dividendos endeudándose porque su caja libre es insuficiente, pone en peligro su salud financiera a largo plazo.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    `;
  }

  function renderAnalisisIaContent(activeTabId) {
    return `
      <div class="guias-df-wrap">
        <!-- Sub-navegación de 2 pestañas: Trimestral vs. Anual -->
        <nav class="guias-subnav-tabs" role="tablist" aria-label="Análisis con IA">
          ${ANALISIS_IA_TABS.map((tab) => `
            <button
              type="button"
              class="guias-subnav-tab ${activeTabId === tab.id ? 'active' : ''}"
              data-iasubtab="${escapeHtml(tab.id)}"
              role="tab"
              id="iasubtab-${escapeHtml(tab.id)}"
              aria-selected="${activeTabId === tab.id ? 'true' : 'false'}"
              aria-controls="guias-ia-panel-${escapeHtml(tab.id)}"
            >
              ${tab.iconoSvg}
              <span>${escapeHtml(tab.nombre)}</span>
            </button>
          `).join('')}
        </nav>

        <!-- Contenedores de cada tipo de análisis -->
        <div class="guias-df-panels">
          <!-- 1. ANÁLISIS TRIMESTRAL (FORM 10-Q) -->
          <div
            id="guias-ia-panel-trimestral"
            class="guias-df-panel guias-ia-tab-panel ${activeTabId === 'trimestral' ? 'active' : ''}"
            role="tabpanel"
            aria-labelledby="iasubtab-trimestral"
            ${activeTabId === 'trimestral' ? '' : 'hidden'}
          >
            <article class="guias-df-card">
              <header class="guias-df-header">
                <div class="guias-df-header-left">
                  <span class="scope-badge">Auditoría con IA · Form 10-Q</span>
                  <h3>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    Análisis Trimestral (Form 10-Q)
                  </h3>
                  <span class="guias-df-en-title">Quarterly Report · Pulso Operativo, Márgenes y Dos Horizontes</span>
                </div>
              </header>

              <p class="guias-df-desc">
                El <strong>formulario 10-Q</strong> es el informe financiero oficial que las empresas cotizadas en EE.UU. presentan a la SEC tres veces al año (al cierre de Q1, Q2 y Q3). Son cuentas intermedias no auditadas por firmas externas, orientadas a medir el pulso inmediato del negocio, la evolución de márgenes, el poder de fijación de precios y la estacionalidad operativa.
              </p>

              <div class="guias-df-grid">
                <div class="guias-df-box">
                  <h4>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    Los Dos Horizontes Temporales de Cifra
                  </h4>
                  <p>
                    Para evitar engaños por estacionalidad, en los trimestres Q2 y Q3 la IA analiza obligatoriamente dos perspectivas paralelas: <strong>«ÚLTIMOS 3 MESES»</strong> (cifras exclusivas del trimestre para captar la aceleración o desaceleración reciente) y <strong>«EN TODO EL AÑO (Acumulado YTD)»</strong> (cifras de 6 o 9 meses para ver la tendencia estructural). En Q1 se evalúa el horizonte único de 3 meses.
                  </p>
                </div>

                <div class="guias-df-box">
                  <h4>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>
                    ¿Cómo audita la IA el informe trimestral?
                  </h4>
                  <p>
                    El motor de Cifra no se limita a leer el PDF: extrae los datos oficiales XBRL de la SEC, revierte deterioros contables para igualar bases con el año anterior, normaliza la tasa fiscal al 23%, deduce flujos trimestrales cuando la empresa solo publica acumulados y cuadra rigurosamente las fuentes y usos de capital en el balance.
                  </p>
                </div>
              </div>

              <!-- LOS 3 BLOQUES DEL ANÁLISIS TRIMESTRAL -->
              <div class="guias-lines-section">
                <div class="guias-lines-title-row">
                  <span class="scope-badge">Metodología Cifra</span>
                  <h4>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                    Los 3 Bloques Clave del Análisis Trimestral
                  </h4>
                  <p>Estructura paso a paso generada por la IA para cada trimestre:</p>
                </div>

                <div class="guias-lines-list">
                  <!-- BLOQUE 1: VENTAS Y RENTABILIDAD -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">B1</span>
                        <h5>Ventas y Rentabilidad <span class="guias-line-en-name">(Cuenta de Resultados Ajustada)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Normalización Operativa</span>
                    </div>
                    <p class="guias-line-desc">
                      Audita las 5 métricas canónicas: Ventas, Beneficio Bruto, Beneficio Operativo, EBT y Beneficio Neto, contrastadas contra el mismo período del ejercicio anterior.
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Ajustes automáticos de la IA en la Cuenta de Resultados:</strong>
                        <ul style="margin: 4px 0 0 16px; padding: 0; line-height: 1.55;">
                          <li><strong>Reversión de deterioros (Impairments):</strong> Si en el trimestre actual o previo hubo depreciaciones contables de marcas o fondos de comercio (como los 1.428M en Kraft Heinz), la IA los suma de vuelta al Beneficio Operativo en la columna <em>Ajustado</em> para comparar la rentabilidad operativa limpia año a año.</li>
                          <li><strong>Normalización fiscal al 23%:</strong> Si la tasa impositiva reportada sufre desviaciones superiores al ±20% por beneficios fiscales o deducciones extraordinarias, la IA recalcula los impuestos al 23% sobre el EBT ajustado (<code>Beneficio Neto Ajustado = EBT Ajustado × 0,77</code>) desglosando la diferencia en nota explicativa.</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <!-- BLOQUE 2: CASH FLOW -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">B2</span>
                        <h5>Cash Flow y Flujo de Caja Libre <span class="guias-line-en-name">(Deducción Trimestral & Circulante)</span></h5>
                      </div>
                      <span class="guias-line-type-badge">Generación de Efectivo Real</span>
                    </div>
                    <p class="guias-line-desc">
                      Evalúa la conversión real de los beneficios en dinero líquido a través de 6 métricas: Cash Flow Operativo, CAPEX, Free Cash Flow (FCF), FCF por Acción, Dividendos y Capital Libre.
                    </p>
                    <div class="guias-line-rule-box amber">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>Algoritmos clave del bloque de flujos:</strong>
                        <ul style="margin: 4px 0 0 16px; padding: 0; line-height: 1.55;">
                          <li><strong>Deducción matemática en Q2 y Q3:</strong> La mayoría de empresas estadounidenses solo publican el Cash Flow acumulado (YTD) en sus 10-Q. La IA de Cifra deduce automáticamente el flujo exclusivo de los 3 meses restando el acumulado del trimestre anterior: <code>Flujo 3M = Flujo YTD (actual) - Flujo YTD (previo)</code>.</li>
                          <li><strong>Doble ajuste (Circulante + Fiscal):</strong> La IA detecta tensiones temporales de capital de trabajo y concilia los impuestos pagados en efectivo frente a los devengados para ofrecer dos escenarios: <em>Normal</em> vs. <em>Ajustado</em>.</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <!-- BLOQUE 3: ASIGNACIÓN DE CAPITAL -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">B3</span>
                        <h5>Asignación de Capital <span class="guias-line-en-name">(Cuadre de Fuentes y Usos)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Control Patrimonial</span>
                    </div>
                    <p class="guias-line-desc">
                      Responde a la pregunta fundamental: <em>«¿De dónde ha salido el dinero en este trimestre y en qué se ha gastado exactamente?»</em>
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>La ecuación de cuadre patrimonial:</strong>
                        Cuadra matemáticamente el <strong>Capital Libre</strong> remanente (FCF - Dividendos) contra los movimientos del balance:
                        <ul style="margin: 4px 0 0 16px; padding: 0; line-height: 1.55;">
                          <li><strong>Fuentes (+):</strong> Entrada de deuda nueva (+), desinversión de marcas o activos (+), reducción de caja (+) o venta neta de inversiones (+).</li>
                          <li><strong>Usos (-):</strong> Adquisición de empresas (-), amortización/reducción de deuda (-), recompras de acciones (-) o aumento de caja retenida (-).</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <!-- 2. ANÁLISIS ANUAL (FORM 10-K) -->
          <div
            id="guias-ia-panel-anual"
            class="guias-df-panel guias-ia-tab-panel ${activeTabId === 'anual' ? 'active' : ''}"
            role="tabpanel"
            aria-labelledby="iasubtab-anual"
            ${activeTabId === 'anual' ? '' : 'hidden'}
          >
            <article class="guias-df-card">
              <header class="guias-df-header">
                <div class="guias-df-header-left">
                  <span class="scope-badge">Auditoría con IA · Form 10-K</span>
                  <h3>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                    Análisis Anual (Form 10-K)
                  </h3>
                  <span class="guias-df-en-title">Annual Report · Cuentas Auditadas, Indagación a Fondo y Proyección Plurianual</span>
                </div>
              </header>

              <p class="guias-df-desc">
                El <strong>formulario 10-K</strong> es el informe anual definitivo y exhaustivo que las empresas presentan ante la SEC. A diferencia del trimestral, está íntegramente <strong>auditado por firmas independientes</strong>, incluye cientos de páginas de notas contractuales, acuerdos de deuda, remuneración de ejecutivos y el plan estratégico de la compañía. En Cifra se analiza bajo un <strong>horizonte único de 12 meses</strong> (sin fragmentar en trimestres).
              </p>

              <div class="guias-df-grid">
                <div class="guias-df-box">
                  <h4>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>
                    Parte I: Resumen de Cuentas Anuales (12 Meses)
                  </h4>
                  <p>
                    Auditoría de ventas normalizadas, reversión de deterioros, impuestos al 23% y recuento riguroso de <strong>acciones vivas a fecha de cierre de balance</strong> (no el promedio ponderado diluido) para aislar el impacto matemático exacto de las recompras sobre el BPA. Cuadre del Cash Flow anual completo y de la asignación patrimonial.
                  </p>
                </div>

                <div class="guias-df-box">
                  <h4>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>
                    Partes II y III: Conclusión, Indagación y Nota
                  </h4>
                  <p>
                    Secciones de investigación exclusivas del 10-K: calendario de vencimientos de deuda año a año a 5 años, proyección a 5 años de recompras de acciones, auditoría de cambios en la cúpula directiva (CEO/CFO), tabla oficial de guidance/previsiones y la <strong>Nota de Resultados final (del 1 al 10)</strong> fundamentada objetivamente.
                  </p>
                </div>
              </div>

              <!-- LAS 6 SECCIONES DE INVESTIGACIÓN A FONDO EXCLUSIVAS DEL 10-K -->
              <div class="guias-lines-section">
                <div class="guias-lines-title-row">
                  <span class="scope-badge">Auditoría Profunda Exclusiva del 10-K</span>
                  <h4>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Las 6 Secciones de Indagación a Fondo del Informe Anual
                  </h4>
                  <p>Información estratégica que solo se encuentra en el 10-K y que Cifra analiza con IA:</p>
                </div>

                <div class="guias-lines-list">
                  <!-- 1. RECOMPRAS Y PROYECCIÓN A 5 AÑOS -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">01</span>
                        <h5>Recompras de Acciones y Proyección a 5 Años <span class="guias-line-en-name">(Share Repurchases & Outlook)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Retorno al Accionista</span>
                    </div>
                    <p class="guias-line-desc">
                      La IA audita el historial de los últimos 3 a 5 años: importe total invertido, acciones retiradas y el <strong>precio medio ponderado pagado por título</strong>. Además, localiza en las notas el <strong>remanente de autorización pendiente</strong> aprobado por el consejo de administración.
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Proyección Matemática a 5 Años:</strong> Con el remanente de autorización y el precio medio pagado, la IA calcula la capacidad de recompra: cuántas acciones pueden retirarse por año, qué porcentaje reducirá el capital social y <strong>cuánto impulsará anualmente el Beneficio por Acción (BPA)</strong> de forma matemática.
                      </div>
                    </div>
                  </div>

                  <!-- 2. CAMBIOS EN LA CÚPULA DIRECTIVA -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">02</span>
                        <h5>Cambios en la Cúpula Directiva <span class="guias-line-en-name">(Executive Changes)</span></h5>
                      </div>
                      <span class="guias-line-type-badge warning">Gobierno Corporativo</span>
                    </div>
                    <p class="guias-line-desc">
                      Si durante el ejercicio ha habido relevos de primer nivel (CEO, CFO, COO o Presidente del Consejo), la IA activa una auditoría directiva exhaustiva.
                    </p>
                    <div class="guias-line-rule-box amber">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>Qué investiga la IA:</strong>
                        • <em>Directivo saliente:</em> Cuánto crecieron las ventas y márgenes durante su mandato, adónde pasa y qué políticas ejecutó.<br>
                        • <em>Directivo entrante:</em> Su historial previo contrastado en empresas anteriores con fechas y métricas, y las prioridades estratégicas que ha anunciado públicamente.
                      </div>
                    </div>
                  </div>

                  <!-- 3. OUTLOOK Y GUIDANCE OFICIAL -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">03</span>
                        <h5>Previsiones Oficiales para el Próximo Año <span class="guias-line-en-name">(Guidance & Outlook)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Proyección Cuantitativa</span>
                    </div>
                    <p class="guias-line-desc">
                      Análisis de las metas y previsiones oficiales comunicadas por la dirección para el nuevo ejercicio: crecimiento de ventas orgánicas en moneda constante, EBT subyacente, BPA diluido, FCF esperado y CAPEX presupuestado.
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Tabla de proyección en cifras monetarias reales:</strong> La IA prohíbe dejar términos ambiguos como «Flat» o simples porcentajes. Para cada métrica, calcula obligatoriamente la <strong>cifra monetaria proyectada en millones de dólares</strong> (ej. <em>Flat ±1% en ventas $\rightarrow$ ~$11.030M – $11.252M</em>), contrastada directamente contra la cifra lograda el año anterior.
                      </div>
                    </div>
                  </div>

                  <!-- 4. DEUDA Y VENCIMIENTOS A 5 AÑOS -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">04</span>
                        <h5>Deuda, Estructura de Capital y Vencimientos <span class="guias-line-en-name">(Debt Maturity Schedule)</span></h5>
                      </div>
                      <span class="guias-line-type-badge warning">Solvencia Plurianual</span>
                    </div>
                    <p class="guias-line-desc">
                      Diagnóstico integral de la estructura de deuda viva: evolución histórica de 10 años de Deuda Total y Deuda Neta, tipo de interés medio ponderado de toda la deuda y detección de refinanciaciones ejecutadas.
                    </p>
                    <div class="guias-line-rule-box red">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <div>
                        <strong>Calendario contractual año a año (Próximos 5 Años):</strong>
                        La IA extrae directamente de las notas de deuda el importe exacto que vence en cada uno de los próximos 5 ejercicios y el <strong>tipo de interés cupón</strong> de cada bono o emisión. Si hubo una refinanciación en el año, calcula su impacto exacto sobre el BPA en dólares por acción.
                      </div>
                    </div>
                  </div>

                  <!-- 5. OPERACIONES CORPORATIVAS -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">05</span>
                        <h5>Operaciones Corporativas <span class="guias-line-en-name">(M&A, Desinversiones & Reestructuraciones)</span></h5>
                      </div>
                      <span class="guias-line-type-badge non-cash">Movimientos Estratégicos</span>
                    </div>
                    <p class="guias-line-desc">
                      Relato detallado de todas las operaciones societarias ejecutadas en el año: adquisiciones de empresas, venta de marcas o filiales, escisiones (*spin-offs*) y planes de reestructuración de costes.
                    </p>
                    <div class="guias-line-rule-box amber">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>Auditoría de racionalidad económica:</strong> La IA analiza qué se compró, por qué (motivo estratégico declarado), condiciones financieras de pago, tamaño del negocio adquirido y sinergias reales esperadas frente al riesgo de deterioro futuro.
                      </div>
                    </div>
                  </div>

                  <!-- 6. NOTA DE RESULTADOS (1 A 10) -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">06</span>
                        <h5>Nota de Resultados del 1 al 10 <span class="guias-line-en-name">(Annual Performance Score)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Calificación Cifra</span>
                    </div>
                    <p class="guias-line-desc">
                      Cada informe anual culmina con una <strong>calificación numérica del 1 al 10</strong> acompañada de una justificación analítica concisa.
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Regla de estricta no especulación:</strong> La nota se fundamenta <strong>exclusivamente en hechos y cifras contables verificables</strong>: la calidad de las ventas y márgenes cerrados, la conversión en Free Cash Flow, el apalancamiento de deuda y el realismo de las metas del guidance. La IA tiene terminantemente prohibido especular sobre si la directiva «cumplirá o no» en el futuro.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    `;
  }

  const GuiasModule = {
    activeApartado: 'aviso',
    activeDatosTab: 'cuenta-resultados',
    activeIaTab: 'trimestral',
    _rendered: false,

    init() {
      const rawHash = (window.location.hash || '').replace('#', '').trim();
      const [apartadoHash, subtabHash] = rawHash.split('/');

      if (APARTADOS.some((a) => a.id === apartadoHash)) {
        this.activeApartado = apartadoHash;
      }
      if (apartadoHash === 'datos-financieros' && DATOS_FINANCIEROS_TABS.some((t) => t.id === subtabHash)) {
        this.activeDatosTab = subtabHash;
      }
      if (apartadoHash === 'analisis-ia' && ANALISIS_IA_TABS.some((t) => t.id === subtabHash)) {
        this.activeIaTab = subtabHash;
      }

      this.render();
      this.bindEvents();
    },

    setApartado(apartadoId) {
      if (!APARTADOS.some((a) => a.id === apartadoId)) return;
      this.activeApartado = apartadoId;

      const tabs = document.querySelectorAll('.guias-nav-tab');
      tabs.forEach((tab) => {
        const isActive = tab.dataset.apartado === apartadoId;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      const panels = document.querySelectorAll('.guias-panel');
      panels.forEach((panel) => {
        const isActive = panel.id === `guia-panel-${apartadoId}`;
        panel.hidden = !isActive;
        panel.classList.toggle('active', isActive);
      });
    },

    setDatosTab(tabId) {
      if (!DATOS_FINANCIEROS_TABS.some((t) => t.id === tabId)) return;
      this.activeDatosTab = tabId;

      const subtabs = document.querySelectorAll('.guias-subnav-tab[data-subtab]');
      subtabs.forEach((tab) => {
        const isActive = tab.dataset.subtab === tabId;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      const panels = document.querySelectorAll('.guias-df-panel:not(.guias-ia-tab-panel)');
      panels.forEach((panel) => {
        const isActive = panel.id === `guias-df-panel-${tabId}`;
        panel.hidden = !isActive;
        panel.classList.toggle('active', isActive);
      });
    },

    setIaTab(tabId) {
      if (!ANALISIS_IA_TABS.some((t) => t.id === tabId)) return;
      this.activeIaTab = tabId;

      const subtabs = document.querySelectorAll('.guias-subnav-tab[data-iasubtab]');
      subtabs.forEach((tab) => {
        const isActive = tab.dataset.iasubtab === tabId;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      const panels = document.querySelectorAll('.guias-ia-tab-panel');
      panels.forEach((panel) => {
        const isActive = panel.id === `guias-ia-panel-${tabId}`;
        panel.hidden = !isActive;
        panel.classList.toggle('active', isActive);
      });
    },

    bindEvents() {
      const root = document.querySelector('#guias-section');
      if (!root) return;

      // Navegación de pestañas principales (Apartados)
      root.querySelectorAll('.guias-nav-tab').forEach((tab) => {
        tab.addEventListener('click', (e) => {
          e.preventDefault();
          const target = tab.dataset.apartado;
          this.setApartado(target);
          if (history.replaceState) {
            const prefix = window.__CIFRA_LANGUAGE__ === 'en' ? '/en' : '';
            const hashTarget = target === 'datos-financieros'
              ? `datos-financieros/${this.activeDatosTab}`
              : target === 'analisis-ia'
              ? `analisis-ia/${this.activeIaTab}`
              : target;
            history.replaceState(null, '', `${prefix}/guias#${hashTarget}`);
          }
        });
      });

      root.querySelectorAll('.guias-nav-tab').forEach((tab, index, list) => {
        tab.addEventListener('keydown', (e) => {
          let nextIndex = null;
          if (e.key === 'ArrowRight') {
            nextIndex = (index + 1) % list.length;
          } else if (e.key === 'ArrowLeft') {
            nextIndex = (index - 1 + list.length) % list.length;
          }
          if (nextIndex !== null) {
            e.preventDefault();
            list[nextIndex].focus();
            list[nextIndex].click();
          }
        });
      });

      // Navegación de sub-pestañas de Datos Financieros
      root.querySelectorAll('.guias-subnav-tab[data-subtab]').forEach((tab) => {
        tab.addEventListener('click', (e) => {
          e.preventDefault();
          const target = tab.dataset.subtab;
          this.setDatosTab(target);
          if (history.replaceState) {
            const prefix = window.__CIFRA_LANGUAGE__ === 'en' ? '/en' : '';
            history.replaceState(null, '', `${prefix}/guias#datos-financieros/${target}`);
          }
        });
      });

      root.querySelectorAll('.guias-subnav-tab[data-subtab]').forEach((tab, index, list) => {
        tab.addEventListener('keydown', (e) => {
          let nextIndex = null;
          if (e.key === 'ArrowRight') {
            nextIndex = (index + 1) % list.length;
          } else if (e.key === 'ArrowLeft') {
            nextIndex = (index - 1 + list.length) % list.length;
          }
          if (nextIndex !== null) {
            e.preventDefault();
            list[nextIndex].focus();
            list[nextIndex].click();
          }
        });
      });

      // Navegación de sub-pestañas de Análisis con IA
      root.querySelectorAll('.guias-subnav-tab[data-iasubtab]').forEach((tab) => {
        tab.addEventListener('click', (e) => {
          e.preventDefault();
          const target = tab.dataset.iasubtab;
          this.setIaTab(target);
          if (history.replaceState) {
            const prefix = window.__CIFRA_LANGUAGE__ === 'en' ? '/en' : '';
            history.replaceState(null, '', `${prefix}/guias#analisis-ia/${target}`);
          }
        });
      });

      root.querySelectorAll('.guias-subnav-tab[data-iasubtab]').forEach((tab, index, list) => {
        tab.addEventListener('keydown', (e) => {
          let nextIndex = null;
          if (e.key === 'ArrowRight') {
            nextIndex = (index + 1) % list.length;
          } else if (e.key === 'ArrowLeft') {
            nextIndex = (index - 1 + list.length) % list.length;
          }
          if (nextIndex !== null) {
            e.preventDefault();
            list[nextIndex].focus();
            list[nextIndex].click();
          }
        });
      });

      // Botón de donación integrado
      const donateBtn = root.querySelector('#guias-donate-action-btn');
      if (donateBtn) {
        donateBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (window.Donations && typeof window.Donations.open === 'function') {
            window.Donations.open();
          } else {
            const modal = document.querySelector('#donations-modal-backdrop');
            if (modal) modal.hidden = false;
          }
        });
      }

      // Navegación rápida desde las tarjetas de funcionalidades
      root.querySelectorAll('.guias-feature-card[data-target-section]').forEach((card) => {
        const handler = (e) => {
          e.preventDefault();
          const targetSec = card.dataset.targetSection;
          if (!targetSec) return;
          const navItem = document.querySelector(`.main-nav [data-section="${targetSec}"], .company-subnav [data-section="${targetSec}"]`);
          if (navItem) {
            navItem.click();
          } else if (targetSec === 'empresa' || targetSec === 'informes' || targetSec === 'datos') {
            const empresaNav = document.querySelector('.main-nav [data-section="empresa"]');
            if (empresaNav) {
              empresaNav.click();
            } else {
              window.location.href = '/empresa';
            }
          }
        };

        card.addEventListener('click', handler);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handler(e);
          }
        });
      });

      window.addEventListener('hashchange', () => {
        const rawHash = (window.location.hash || '').replace('#', '').trim();
        const [apartadoHash, subtabHash] = rawHash.split('/');
        if (APARTADOS.some((a) => a.id === apartadoHash)) {
          this.setApartado(apartadoHash);
        }
        if (apartadoHash === 'datos-financieros' && DATOS_FINANCIEROS_TABS.some((t) => t.id === subtabHash)) {
          this.setDatosTab(subtabHash);
        }
        if (apartadoHash === 'analisis-ia' && ANALISIS_IA_TABS.some((t) => t.id === subtabHash)) {
          this.setIaTab(subtabHash);
        }
      });
    },

    render() {
      const root = document.querySelector('#guias-section');
      if (!root) return;

      root.innerHTML = `
        <div class="guias-container">
          <!-- Navegación de apartados -->
          <nav class="guias-nav-tabs" role="tablist" aria-label="Apartados de Guías">
            ${APARTADOS.map((apartado) => `
              <button
                type="button"
                class="guias-nav-tab ${this.activeApartado === apartado.id ? 'active' : ''}"
                data-apartado="${escapeHtml(apartado.id)}"
                role="tab"
                id="tab-${escapeHtml(apartado.id)}"
                aria-selected="${this.activeApartado === apartado.id ? 'true' : 'false'}"
                aria-controls="guia-panel-${escapeHtml(apartado.id)}"
              >
                ${apartado.iconoSvg}
                <span>${escapeHtml(apartado.nombre)}</span>
              </button>
            `).join('')}
          </nav>

          <!-- Paneles de los apartados -->
          <div class="guias-panels-wrap">
            ${APARTADOS.map((apartado) => `
              <div
                id="guia-panel-${escapeHtml(apartado.id)}"
                class="guias-panel ${this.activeApartado === apartado.id ? 'active' : ''}"
                role="tabpanel"
                aria-labelledby="tab-${escapeHtml(apartado.id)}"
                ${this.activeApartado === apartado.id ? '' : 'hidden'}
              >
                <div class="guias-panel-header">
                  <div class="guias-panel-title-area">
                    <span class="scope-badge">${escapeHtml(apartado.badge)}</span>
                    <h3>${escapeHtml(apartado.nombre)}</h3>
                    <p class="guias-panel-desc">${escapeHtml(apartado.descripcion)}</p>
                  </div>
                </div>

                ${apartado.id === 'aviso'
                  ? renderAvisoPanelContent()
                  : apartado.id === 'datos-financieros'
                  ? renderDatosFinancierosContent(this.activeDatosTab)
                  : apartado.id === 'analisis-ia'
                  ? renderAnalisisIaContent(this.activeIaTab)
                  : `
                    <div class="guias-empty-container">
                      <div class="guias-empty-box">
                        <div class="guias-empty-icon-wrap">
                          ${apartado.iconoSvg}
                        </div>
                        <h4>${escapeHtml(apartado.emptyTitulo)}</h4>
                        <p>${escapeHtml(apartado.emptyTexto)}</p>
                      </div>
                    </div>
                  `
                }
              </div>
            `).join('')}
          </div>
        </div>
      `;
      this._rendered = true;
    }
  };

  window.GuiasModule = GuiasModule;
})();
