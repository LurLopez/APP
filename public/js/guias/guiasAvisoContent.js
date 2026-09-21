/**
 * @fileoverview Panel «Aviso y Proyecto» de las Guías (disclaimer, qué ofrece Cifra,
 * análisis con IA y fase beta/donaciones).
 * @module guiasAvisoContent
 */

function renderAvisoWrapper() {
  return `
      <div class="guias-intro-wrap">
`;
}
function renderAvisoDisclaimerBlock() {
  return `        <!-- 1. BLOQUE PRINCIPAL: DISCLAIMER / AVISO LEGAL -->
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

`;
}
function renderAvisoFeaturesBlock() {
  return `        <!-- 2. ¿QUÉ OFRECE CIFRA? -->
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

`;
}
function renderAvisoAiBlock() {
  return `        <!-- 3. ANÁLISIS DE RESULTADOS CON IA EN INFORMES TRIMESTRALES -->
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

`;
}
function renderAvisoBetaBlock() {
  return `        <!-- 4. FASE BETA, GRATIS Y DONACIONES -->
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

export function renderAvisoPanelContent() {
  return [
    renderAvisoWrapper(),
    renderAvisoDisclaimerBlock(),
    renderAvisoFeaturesBlock(),
    renderAvisoAiBlock(),
    renderAvisoBetaBlock(),
  ].join('');
}
