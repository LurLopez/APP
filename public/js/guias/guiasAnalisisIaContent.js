/**
 * @fileoverview Paneles de la sub-pestaña «Análisis con IA» de las Guías:
 * metodología del informe trimestral (10-Q) y del anual (10-K).
 * @module guiasAnalisisIaContent
 */

import { ANALISIS_IA_TABS } from './guiasData.js';
import { escapeHtml } from './guiasHtml.js';

function renderIaTabs(activeTabId) {
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
`;
}
function renderQuarterlyIntro(activeTabId) {
  return `          <!-- 1. ANÁLISIS TRIMESTRAL (FORM 10-Q) -->
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
                El <strong>formulario 10-Q</strong> es el informe financiero oficial que las empresas cotizadas en EE.UU. presentan a la SEC tres veces al año (al cierre de Q1, Q2 y Q3). Son <strong>cuentas intermedias no auditadas por firmas externas</strong>, orientadas a medir el pulso inmediato del negocio: evolución de ventas y márgenes, poder de fijación de precios (*pricing power*), generación de caja real y disciplina en el uso del capital. Cifra procesa los datos XBRL oficiales y audita con IA la coherencia matemática entre los resultados contables, los flujos de tesorería y el balance patrimonial.
              </p>

              <div class="guias-df-grid">
                <div class="guias-df-box">
                  <h4>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    ¿Qué Hacemos? Los Últimos 3 Meses y Todo el Año
                  </h4>
                  <p>
                    Para evitar engaños provocados por la estacionalidad del negocio, cada informe se analiza en <strong>dos horizontes paralelos e independientes</strong>: <strong>«ÚLTIMOS 3 MESES»</strong> (las cifras exclusivas del trimestre, para captar la aceleración, la pérdida de margen o el frenazo reciente en volumen) y <strong>«EN TODO EL AÑO (Acumulado YTD)»</strong> (las cifras de 6 o 9 meses, para ver la trayectoria anual frente al guidance). En Q1 el análisis se hace sobre el horizonte único de 3 meses. Cada horizonte se presenta en una página propia.
                  </p>
                </div>

                <div class="guias-df-box">
                  <h4>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>
                    Las 3 Partes de Cada Análisis
                  </h4>
                  <p>
                    Dentro de cada horizonte, el informe se divide en tres partes: <strong>1) Cuenta de Resultados</strong> (ventas, márgenes e impuestos normalizados), <strong>2) Cash Flow</strong> (el dinero real que genera el negocio) y <strong>3) Asignación de Capital</strong> (de dónde salió la caja y en qué se gastó). Una cadena de 3 agentes de IA —origen, sector y analista— extrae los datos de la SEC, aplica las reglas de consumo defensivo y construye el informe final.
                  </p>
                </div>
              </div>

              <!-- LOS 3 BLOQUES DEL ANÁLISIS TRIMESTRAL -->
              <div class="guias-lines-section">
                <div class="guias-lines-title-row">
                  <span class="scope-badge">Metodología Cifra</span>
                  <h4>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                    Las 3 Partes del Análisis Trimestral
                  </h4>
                  <p>Estructura, fórmulas, reglas contables y lógica de auditoría generada por la IA para cada trimestre:</p>
                </div>

                <div class="guias-lines-list">
`;
}
function renderQuarterlyBlock1() {
  return `                  <!-- BLOQUE 1: CUENTA DE RESULTADOS -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">01</span>
                        <h5>Cuenta de Resultados <span class="guias-line-en-name">(Income Statement & Normalized Profitability)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Normalización Operativa</span>
                    </div>
                    <p class="guias-line-desc">
                      Audita las 5 métricas canónicas: <strong>Ventas (Revenue / Top-Line)</strong>, <strong>Beneficio Bruto (Gross Profit)</strong>, <strong>Beneficio Operativo (EBIT)</strong>, <strong>EBT (Beneficio antes de impuestos)</strong> y <strong>Beneficio Neto (Bottom-Line)</strong>, junto con las métricas por acción al pie (<strong>acciones en circulación vivas</strong> y <strong>BPA / EPS</strong>). Se presenta bajo una tabla de 6 columnas: <code>Ajustado</code>, <code>Anterior Ajustado</code>, <code>% Ajustado</code>, <code>Normal</code>, <code>Anterior Normal</code> y <code>% Normal</code>. La columna que importa es <strong>«Ajustado»</strong>: limpia el ruido contable para poder comparar el negocio real de un periodo contra otro.
                    </p>

                    <!-- AJUSTE 1: DETERIOROS DE FONDO DE COMERCIO E INTANGIBLES -->
                    <div class="guias-line-rule-box green" style="margin-bottom: 10px;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>1. Los deterioros de fondo de comercio e intangibles (lo más importante):</strong>
                        cuando una empresa registra un deterioro de marcas, patentes o fondo de comercio (como los 1.428M de Kraft Heinz en 2024 o los 3.919,6M de Molson Coors en 2025), <strong>no es un gasto real ni una salida de caja</strong>: es el reconocimiento de que en el pasado se pagó de más por algo. La IA lo suma de vuelta al Beneficio Operativo y al EBT en la columna <em>Ajustado</em>:
                        <code>Beneficio Operativo Ajustado = Beneficio Operativo Normal + Impairment</code>.
                        Así se compara la rentabilidad limpia y recurrente del negocio año a año (*peras con peras*), sin castigar la operativa de hoy por un error de sobreprecio del pasado.
                      </div>
                    </div>

                    <!-- AJUSTE 2: NORMALIZACIÓN FISCAL AL 23% -->
                    <div class="guias-line-rule-box amber" style="margin-bottom: 10px;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>2. Los impuestos (el segundo ajuste clave):</strong>
                        los impuestos pueden salir <strong>negativos</strong> (un beneficio fiscal, como en Molson Coors) o verse distorsionados por créditos, repatriaciones o litigios puntuales. Lo normal en una empresa sana es tributar entre el <strong>20 % y el 25 %</strong>, así que cuando la desviación supera el <strong>±20 %</strong> la IA recalcula el impuesto aplicando el 23 % directamente sobre el EBT Ajustado:
                        <code>Beneficio Neto Ajustado = EBT Ajustado × 0,77</code>.
                        Se añade una nota explicativa con el EBT ajustado y los impuestos reportados frente a los normalizados.
                      </div>
                    </div>

                    <p class="guias-line-desc">
                      <strong>Ejemplo real — Cuenta de Resultados (Molson Coors, 10-K 2025).</strong> En su 10-K, Molson Coors presentó una pérdida antes de impuestos de 2.518M y unos impuestos <strong>negativos</strong> de 337,8M (un beneficio fiscal). El ajuste es doble: se suman de vuelta los <strong>3.919,6M de deterioros</strong> (el beneficio operativo pasa de −2.336,9M a 1.583,8M) y se normalizan los impuestos al 23 % del EBT ajustado (el beneficio neto pasa de −2.139,6M a 1.080M).
                    </p>
                    <figure class="guias-example-figure compact">
                      <img src="/imagenes/guias/tap-10k-cuenta-impuestos.png?v=2" alt="Cuenta de resultados del 10-K de Molson Coors 2025: pérdida antes de impuestos de 2518,0M e impuesto negativo (beneficio fiscal) de 337,8M">
                      <figcaption>La cuenta de resultados oficial del 10-K: los impuestos salieron negativos (beneficio fiscal de 337,8M).</figcaption>
                    </figure>
                    <figure class="guias-example-figure compact">
                      <img src="/imagenes/guias/tap-2025-cuenta-anual-impuestos.png?v=2" alt="Cuenta de resultados ajustada del informe de Cifra para Molson Coors 2025, con los deterioros sumados de vuelta y la nota de impuestos normalizados al 23 por ciento">
                      <figcaption>La misma cuenta ya ajustada por Cifra: deterioros sumados de vuelta (operativo de −2.336,9M a 1.583,8M) e impuestos normalizados al 23 % (neto de −2.139,6M a 1.080M).</figcaption>
                    </figure>
                  </div>

`;
}
function renderQuarterlyBlock2() {
  return `                  <!-- BLOQUE 2: CASH FLOW -->
                  <div class="guias-line-card" id="guias-bloque-cashflow">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">02</span>
                        <h5>Cash Flow y Flujo de Caja Libre <span class="guias-line-en-name">(Cash Flow, Working Capital & FCF)</span></h5>
                      </div>
                      <span class="guias-line-type-badge">Generación de Efectivo Real</span>
                    </div>
                    <p class="guias-line-desc">
                      Evalúa la conversión real de los beneficios contables en dinero líquido a través de 6 líneas obligatorias: <strong>Cash Flow (Operativo)</strong>, <strong>CAPEX (Inversión en capital)</strong>, <strong>FCF (Free Cash Flow = Cash Flow − CAPEX)</strong>, <strong>FCF/Acción</strong>, <strong>Dividendo (pagado en efectivo)</strong> y <strong>Libre (Remanente = FCF − Dividendo)</strong>. Se presenta en dos columnas comparativas: <code>Normal (WC=...)</code> y <code>Ajustado*1 (WC=...)</code>.
                    </p>

                    <p class="guias-line-desc">
                      Lo más importante de esta parte son <strong>tres ajustes</strong>: las <strong>stock options</strong> (diluyen al accionista aunque no salga caja), los <strong>impuestos</strong> (lo que de verdad se ha pagado en efectivo frente a lo que debería pagarse) y el <strong>WK</strong> o circulante (el dinero atrapado en inventarios y cobros).
                    </p>

                    <!-- ALGORITMO 1: DEDUCCIÓN TRIMESTRAL -->
                    <div class="guias-line-rule-box amber" style="margin-bottom: 10px;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>Cómo obtenemos los «últimos 3 meses» (Q2 y Q3):</strong>
                        la normativa SEC solo obliga a publicar el estado de flujos acumulado (YTD: 6 meses en Q2, 9 meses en Q3). Para ofrecer la perspectiva del trimestre puro, la IA deduce el flujo exclusivo de los 3 meses restando el acumulado reportado en el trimestre previo:
                        <code>Flujo Trimestral (Qn) = Flujo Acumulado (Qn) − Flujo Acumulado (Qn−1)</code>.
                        Esta resta se aplica a Cash Flow, CAPEX, FCF, Dividendos y Libre. Al ser una operación aritmética estándar para aislar el periodo, no lleva notas de asterisco. En Q1, el acumulado coincide con los 3 meses y no requiere resta.
                      </div>
                    </div>

                    <!-- AJUSTE 2B: STOCK OPTIONS -->
                    <div class="guias-line-rule-box amber" style="margin-bottom: 10px;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>1. La compensación en Stock Options (SBC):</strong>
                        en el estado de flujos la empresa <strong>suma de vuelta</strong> la compensación pagada en acciones porque «no ha salido dinero de la caja». Es cierto, pero esas acciones se conceden <strong>con descuento</strong> respecto a su valor real y <strong>nos están diluyendo</strong>: cada año se emiten títulos nuevos que reducen nuestra parte del negocio. Aunque no sea una salida de dinero, es un coste económico para el accionista. Por eso en la columna Ajustado se <strong>quita un 120 % del valor de esa línea</strong>: el 100 % para neutralizar el apunte no monetario y un <strong>20 % adicional</strong> como coste conservador de la dilución (el mismo ajuste que vimos en el apartado de Datos Financieros).
                      </div>
                    </div>

                    <!-- AJUSTE 3: CONCILIACIÓN FISCAL CASH FLOW -->
                    <div class="guias-line-rule-box amber" style="margin-bottom: 10px;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      <div>
                        <strong>2. Los Impuestos (lo pagado en efectivo vs. lo que tocaba pagar):</strong>
                        la IA extrae del estado de flujos los impuestos <strong>efectivamente pagados en caja</strong> y los contrasta contra los impuestos normalizados al 23 % del EBT Ajustado (los que la empresa <em>debería</em> haber pagado). Si pagó de menos, esa diferencia se descuenta de la columna Ajustado:
                        <code>Ajuste fiscal = Impuestos pagados en efectivo − (0,23 × EBT Ajustado)</code>.
                        Se añade la Nota <code>*2: Impuestos</code> con el cálculo.
                      </div>
                    </div>

                    <!-- AJUSTE 2: NORMALIZACIÓN DE CIRCULANTE -->
                    <div class="guias-line-rule-box green" style="margin-bottom: 10px;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>3. El Circulante o WK (Working Capital):</strong>
                        el circulante es el dinero que el negocio tiene <em>atrapado</em> para poder operar. Se calcula con las tres partidas que ya vimos en la guía de Datos Financieros: las <strong>cuentas por cobrar</strong> (lo que los clientes nos deben), los <strong>inventarios</strong> (el stock en almacén) menos las <strong>cuentas por pagar</strong> (lo que financian los proveedores). El ejemplo de Nike lo dejaba claro: si un negocio tiene <strong>10.000M atrapados</strong> (3.000M de clientes + 8.000M de inventario − 1.000M de proveedores) y sus precios y volúmenes crecen un 10 %, necesita atar <strong>1.000M más de caja</strong> solo para funcionar igual. Eso es exactamente lo que estima esta fórmula:
                        <div style="margin: 6px 0; font-weight: 700; color: var(--ink);">
                          <code>WK = (Cuentas por pagar − Inventarios − Cuentas por cobrar) × (inflación + volumen)</code>
                        </div>
                        <em>Importante:</em> esto <strong>no es una ciencia cierta</strong>; es una <strong>fórmula de estimación propia</strong>, inventada por el autor de Cifra, y no un estándar contable. No pretende ser exacta: solo sirve para hacerse una idea de cuánto <em>debería</em> haber gastado (o liberado) el negocio en circulante en un año normal y tener una referencia razonable contra la que medir lo que la empresa reporta.
                        <br>Se ajusta el flujo descontando la diferencia entre lo reportado y lo teórico: <code>Cash Flow Ajustado = Cash Flow Normal − (WK_reportado − WK_teórico)</code>, recalculando FCF, FCF/Acción y Capital Libre.
                        <br><em>Ejemplo real (KHC 2026 Q2):</em> la fórmula daba <strong>−8,4M</strong> para el trimestre, pero la empresa reportó <strong>+115M</strong> de liberación de circulante; esa desviación de 123,4M se resta en la columna Ajustado (1082M &rarr; 958,6M).
                      </div>
                    </div>

                    <p class="guias-line-desc">
                      <strong>Ejemplo real — Cash Flow (Molson Coors, 10-K 2025).</strong> El mejor caso para ver los ajustes fiscales en el estado de flujos:
                    </p>
                    <ul style="margin: 6px 0 10px 16px; padding: 0; line-height: 1.6; font-size: 14px; color: var(--ink-2);">
                      <li><strong>Paso 1 — Igualar los impuestos a cero:</strong> el estado de flujos tiene una línea que <em>neutraliza</em> el impuesto para que el flujo no dependa de un apunte contable. En 2025 los impuestos de la cuenta de resultados salieron <strong>negativos</strong> (un beneficio fiscal de 337,8M), así que esa línea <strong>quita 337,8M del beneficio neto</strong>; en 2024, cuando eran un gasto, la misma línea <strong>sumaba de vuelta +345,3M</strong>.</li>
                      <li><strong>Paso 2 — Quitar los impuestos realmente pagados:</strong> la línea <em>«Income tax (paid) received»</em> resta el dinero que salió de caja por impuestos: <strong>131,4M</strong> en 2025.</li>
                      <li><strong>Paso 3 — Comparar con lo normalizado:</strong> el bloque de Cuenta de Resultados ya calculó que debería haber pagado <strong>322,6M</strong> (23 % del EBT Ajustado de 1402,7M). Como solo pagó 131,4M, ha pagado <strong>322,6 − 131,4 = 191,2M menos</strong> de lo que le correspondía: esa cantidad se le quita al flujo de operaciones (1943,2M &rarr; 1752M antes de CAPEX).</li>
                    </ul>
                    <figure class="guias-example-figure compact">
                      <img src="/imagenes/guias/tap-10k-cashflow-impuestos.png?v=2" alt="Estado de flujos del 10-K de Molson Coors: línea Income tax (benefit) expense de -337,8M y línea Income tax (paid) received de -131,4M">
                      <figcaption>Estado de flujos oficial del 10-K: la línea que iguala los impuestos a cero (337,8M) y lo realmente pagado en caja (131,4M).</figcaption>
                    </figure>
                  </div>

`;
}
function renderQuarterlyBlock3() {
  return `                  <!-- BLOQUE 3: ASIGNACIÓN DE CAPITAL -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">03</span>
                        <h5>Asignación de Capital <span class="guias-line-en-name">(Capital Allocation & Balance Sheet Reconciliation)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Control Patrimonial</span>
                    </div>
                    <p class="guias-line-desc">
                      Responde a la pregunta fundamental del inversor: <em>«¿De dónde ha salido el dinero en este trimestre y en qué se ha gastado exactamente?»</em> La tabla arranca obligatoriamente con la fila <strong>Libre</strong> resultante del Bloque de Cash Flow (<code>FCF - Dividendos</code>) y reconcilia los movimientos patrimoniales calculados directamente desde los balances trimestrales oficiales de la SEC.
                    </p>

                    <!-- CUADRE DESDE EL BALANCE -->
                    <div class="guias-line-rule-box green" style="margin-bottom: 10px;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Cálculo de Variaciones Directamente desde el Balance Trimestral:</strong>
                        <ul style="margin: 4px 0 0 16px; padding: 0; line-height: 1.55;">
                          <li><strong>Caja Balance:</strong> <code>ΔCaja = -(Caja actual - Caja anterior)</code>. Si la tesorería aumenta, es un gasto o uso de capital (-); si disminuye, actúa como fuente de liquidez (+). Coincide siempre con la variación de saldos del balance general.</li>
                          <li><strong>Deuda Balance:</strong> <code>ΔDeuda = Deuda actual - Deuda anterior</code> (Largo plazo + Corto plazo financiero; excluye proveedores). Si la deuda sube, entra dinero prestado (+ fuente); si se amortiza, sale dinero (- uso).</li>
                          <li><strong>Inversiones a corto plazo:</strong> Compra de valores negociables (- uso) o liquidación (+ fuente).</li>
                          <li><strong>Recompras de acciones:</strong> Desembolso en compra de títulos propios (- uso).</li>
                          <li><strong>Adquisiciones (M&A):</strong> Compra de negocios o marcas (- uso, filtro material ≥ 50M).</li>
                          <li><strong>Desinversiones:</strong> Ingresos por venta de marcas, filiales o activos (+ fuente, filtro material ≥ 50M).</li>
                          <li><strong>Financiación de capital:</strong> Emisión de preferentes o venta de minoritarios (+ fuente, ≥ 50M).</li>
                          <li><strong>Deuda asumida (no-cash):</strong> Corrección negativa (-) cuando se asume deuda preexistente de un negocio comprado sin que haya entrado caja.</li>
                          <li><strong>Movimientos que no pasan por caja:</strong> El efectivo restringido/escrow y la deuda no monetaria <strong>no se pintan como filas</strong> (la tabla solo lleva movimientos de caja). Si el cuadre no cierra, el informe los explica bajo la tabla con su importe exacto (ver más abajo), aunque el descuadre entre dentro del umbral razonable.</li>
                        </ul>
                      </div>
                    </div>

                    <!-- MOVIMIENTOS QUE NO PASAN POR CAJA -->
                    <div class="guias-line-rule-box amber" style="margin-bottom: 10px;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Agujeros que no son agujeros: efectivo restringido y deuda no monetaria.</strong>
                        <p style="margin: 6px 0 0;">Hay movimientos que cambian el balance sin ser ni entradas ni salidas de caja: el <strong>efectivo restringido</strong> (dinero consignado en escrow, colateral o depósitos, que solo cambia de cajón) y la <strong>deuda no monetaria</strong> (deuda que desaparece o aparece sin pagarse en efectivo). La tabla de Asignación de Capital solo lleva movimientos de caja, así que estos casos quedan fuera y, cuando el cuadre no cierra, el informe los explica bajo la tabla con su importe exacto y el resto pendiente (aunque el descuadre entre dentro del umbral razonable). Solo si no hay movimientos de este tipo no se añade nada.</p>
                        <p style="margin: 8px 0 0;"><strong>Ejemplo (deuda no monetaria):</strong> la empresa tiene bonos anotados en el balance por <strong>1.000M</strong>. Los tipos de interés suben y esos bonos (con cupón antiguo) pasan a valer <strong>800M</strong> en el mercado. La empresa los recompra pagando <strong>800M</strong> y la obligación de 1.000M desaparece: la deuda baja 1.000M, la caja baja 800M y <strong>200M no costaron nada</strong> (ganancia por extinción de deuda).</p>
                        <ul style="margin: 8px 0 0 16px; padding: 0; line-height: 1.55;">
                          <li><code>Libre 0</code> · <code>Deuda -1.000</code> · <code>Caja +800</code> · <code>En total -200</code> → el informe avisa: «No cuadra: quedan -200M».</li>
                          <li>Bajo la tabla lo explica: <em>«Los siguientes no pasan por caja y explican el descuadre: deuda no monetaria (recompras o amortizaciones anticipadas de deuda con ganancia o pérdida, efecto divisa) +200M. Sin ellos, el resto sin explicar sería 0M, dentro del margen razonable.»</em></li>
                          <li>Si los tipos bajan y el bono cotiza por encima (1.100M), recomprarlo cuesta más que su valor contable: la deuda no monetaria sería <strong>negativa</strong> y también se explica igual.</li>
                        </ul>
                        <p style="margin: 8px 0 0;"><strong>Ejemplo real:</strong> en el 10-Q de <strong>Kraft Heinz</strong> (Q2 FY2026) la deuda del balance cayó 2.132M, pero el estado de flujos solo refleja 1.829M de movimientos de deuda. Los 303M de diferencia —ganancia por extinción anticipada declarada en el propio informe («Loss/(gain) on extinguishment of debt») más efecto divisa— se explican bajo la tabla. Y en el 10-Q de <strong>PepsiCo</strong> (2018) el <em>escrow</em> de 1.997M de la compra de SodaStream (efectivo restringido) es otro caso típico: el dinero no se gastó, solo quedó consignado.</p>
                      </div>
                    </div>

                    <!-- VEREDICTO DE CUADRE -->
                    <div class="guias-line-rule-box green" style="margin-bottom: 10px;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Regla de Suma «En total» y Doble Veredicto Analítico:</strong>
                        Se calcula la suma algebraica con signo: <code>En total = Libre + Σ Fuentes/Usos</code>.
                        <ul style="margin: 4px 0 0 16px; padding: 0; line-height: 1.55;">
                          <li><strong>Cuadre razonable:</strong> Si <code>|En total| ≤ max(50M, 20% del Libre, 10% de la suma bruta)</code>, la IA emite: <em>«Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle.»</em> (o <em>«El resultado cuadra.»</em> si es 0).</li>
                          <li><strong>Descuadre significativo:</strong> Si supera dicho umbral: <em>«No cuadra. Hay una discrepancia significativa entre el capital libre y los usos detectados; se deberá analizar más a fondo.»</em>
                          Que ponga «no cuadra» <strong>no significa necesariamente que la IA lo haya hecho mal</strong>: normalmente es que hay dinero que se está «perdiendo» por el camino y no aparece en las partidas detectadas. Cuando el sistema conoce la causa exacta (<strong>efectivo restringido</strong>, <strong>deuda no monetaria</strong>), la propia verificación lo explica bajo la tabla con el importe. Para el resto toca investigar en qué se está yendo: depósitos en <em>escrow</em>, litigios, derivados financieros, adquisiciones parciales u otras partidas de <em>«otros»</em> que el balance no desglosa con claridad.</li>
                        </ul>
                      </div>
                    </div>

                    <p class="guias-line-desc">
                      <strong>Ejemplo real — Asignación de Capital (Molson Coors, 10-K 2025).</strong> Esto es lo que ha hecho el análisis: el cuadre no sale (En total <strong>263,3M</strong>) y emite el aviso de «No cuadra».
                    </p>
                    <figure class="guias-example-figure compact">
                      <img src="/imagenes/guias/tap-2025-asignacion-anual.png?v=2" alt="Tabla de asignación de capital del informe de Cifra para Molson Coors 2025: Libre 691,5M, recompras -647,9M, caja +72,8M, deuda +153,4M y En total 263,3M con el aviso No cuadra">
                      <figcaption>La tabla del informe: Libre 691,5M, desinversiones +15,8M, adquisiciones −22,3M, recompras −647,9M, caja +72,8M y deuda +153,4M; quedan +263,3M sin explicar («No cuadra»).</figcaption>
                    </figure>

                    <p class="guias-line-desc">
                      Para investigarlo, vamos al <strong>10-K</strong> y encontramos el estado de flujos de caja y el balance:
                    </p>
                    <figure class="guias-example-figure compact">
                      <img src="/imagenes/guias/tap-10k-cashflow.png?v=2" alt="Estado de flujos de caja del 10-K de Molson Coors 2025 con las secciones de operación, inversión y financiación">
                      <figcaption>Estado de flujos de caja del 10-K 2025: dividendos pagados 376,3M y compras de acciones propias 647,9M.</figcaption>
                    </figure>
                    <figure class="guias-example-figure compact">
                      <img src="/imagenes/guias/tap-10k-balance.png?v=2" alt="Balance de situación consolidado del 10-K de Molson Coors 2025: caja 896,5M frente a 969,3M y deuda 6.299,5M frente a 6.146,1M">
                      <figcaption>Balance del 10-K: la caja baja de 969,3M a 896,5M (−72,8M) y la deuda sube de 6.146,1M a 6.299,5M (+153,4M).</figcaption>
                    </figure>

                    <p class="guias-line-desc">
                      En el balance, la <strong>caja baja 72,8M</strong> (fuente de liquidez, +) y la <strong>deuda sube 153,4M</strong> (fuente, +), pero al ir a las líneas de deuda del estado de flujos <strong>no aparece que la deuda haya aumentado</strong>: solo hay pagos por 12,8M y ninguna entrada («Proceeds on debt and borrowings —»). Además, hay líneas de «otros» (otros activos) que suben unos <strong>120M</strong> y no se sabe bien a qué corresponden. Ese dinero que «se pierde» por el camino es lo que explica el descuadre: no es un error de la IA, es información que el balance no desglosa con claridad.
                    </p>
                    <figure class="guias-example-figure compact">
                      <img src="/imagenes/guias/tap-10k-deuda-lineas.png?v=2" alt="Líneas del estado de flujos del 10-K de Molson Coors: Payments on debt and borrowings (12.8) y Proceeds on debt and borrowings —">
                      <figcaption>Las líneas de deuda del estado de flujos: solo pagos de 12,8M y ninguna entrada de deuda en 2025.</figcaption>
                    </figure>

                    <p class="guias-line-desc">
                      Aun así, en líneas generales el destino del dinero está claro: <strong>todo el flujo de caja libre se ha gastado en dividendos (376,3M) y recompras (647,9M)</strong>.
                    </p>
                    <p class="guias-line-desc">
                      Informe completo: <a href="/informe/TAP/2025-10K">TAP 2025 (10-K)</a>.
                    </p>
                  </div>
`;
}
function renderQuarterlyTail() {
  return `
                </div>
              </div>
            </article>
          </div>

`;
}
function renderAnnualIntro(activeTabId) {
  return `          <!-- 2. ANÁLISIS ANUAL (FORM 10-K) -->
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
                El <strong>formulario 10-K</strong> es el informe anual definitivo y exhaustivo que las empresas presentan ante la SEC. A diferencia del trimestral, está íntegramente <strong>auditado por firmas independientes</strong>, incluye cientos de páginas de notas contractuales, acuerdos de deuda, remuneración de ejecutivos y el plan estratégico de la compañía. En Cifra se analiza en dos partes bien diferenciadas.
              </p>

              <div class="guias-df-grid">
                <div class="guias-df-box">
                  <h4>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>
                    Parte 1: Exactamente lo Mismo que el Trimestral, pero con Todo el Año
                  </h4>
                  <p>
                    La primera parte es <strong>idéntica a la de los informes trimestrales</strong>: los mismos bloques de Cuenta de Resultados, Cash Flow y Asignación de Capital, con los mismos ajustes (deterioros de fondo de comercio e intangibles, impuestos normalizados al 23 %, stock options al 120 % y WK). La única diferencia es el <strong>horizonte único de 12 meses</strong>: el año completo, sin fragmentar en trimestres.
                    <br><br>
                    <a href="#analisis-ia/trimestral" style="font-weight: 700; color: var(--accent);">Ver la guía del análisis trimestral (10-Q) →</a>
                  </p>
                </div>

                <div class="guias-df-box">
                  <h4>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>
                    Parte 2: Indagación a Fondo Exclusiva del 10-K
                  </h4>
                  <p>
                    El 10-K permite ir mucho más allá del pulso operativo: secciones específicas sobre las <strong>recompras de acciones</strong> (con proyección a 5 años), el <strong>calendario de vencimientos de deuda</strong> (que normalmente solo aparece en el informe anual), los <strong>cambios en la cúpula directiva</strong>, las <strong>adquisiciones y desinversiones</strong>, la <strong>evolución del dividendo</strong>, el guidance oficial y la <strong>Nota de Resultados final (del 1 al 10)</strong>.
                  </p>
                </div>
              </div>

              <!-- LAS SECCIONES DE INVESTIGACIÓN A FONDO EXCLUSIVAS DEL 10-K -->
              <div class="guias-lines-section">
                <div class="guias-lines-title-row">
                  <span class="scope-badge">Auditoría Profunda Exclusiva del 10-K</span>
                  <h4>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Las Secciones de Indagación a Fondo del Informe Anual
                  </h4>
                  <p>Información estratégica que solo se encuentra en el 10-K y que Cifra analiza con IA:</p>
                </div>

                <div class="guias-lines-list">
`;
}
function renderAnnualSection1() {
  return `                  <!-- 1. RECOMPRAS Y PROYECCIÓN A 5 AÑOS -->
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

                    <p class="guias-line-desc" style="margin-top: 10px; margin-bottom: 0;">
                      <strong>Ejemplo real (TAP, 10-K 2025):</strong> en 2025 recompró <strong>12,9M de acciones por 658,1M$</strong> a un precio medio de 51,0$ (2024: 10,9M acciones por 645,2M$ a 59,2$; 2023: 3,5M por 212,7M$ a 61,6$). Quedaban <strong>~2.560M$ de autorización</strong> vigente hasta diciembre de 2031. Las acciones vivas cayeron un 4,7 % en el año (de 208,9M a 199,1M) e impulsaron el BPA un +4,9 %. Proyección: ~10,0M de acciones retiradas al año (~5,0 % del capital), BPA +5,3 % anual.
                    </p>
                    <figure class="guias-example-figure compact">
                      <img src="/imagenes/guias/tap-analisis-recompras.png?v=2" alt="Sección de recompras del análisis de TAP 2025: evolución del número de acciones 2021-2025 y extracto oficial del 10-K con las recompras anuales">
                      <figcaption>La sección de recompras del análisis, con la evolución de acciones, la proyección y el extracto oficial del 10-K.</figcaption>
                    </figure>
                  </div>

`;
}
function renderAnnualSection2() {
  return `                  <!-- 2. DEUDA Y VENCIMIENTOS A 5 AÑOS -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">02</span>
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
                        el <strong>calendario de vencimientos</strong> es información que normalmente <strong>solo aparece en el 10-K</strong> (en las notas de deuda), así que el informe anual es la ocasión de saber exactamente cuándo hay que pagar o refinanciar. La IA extrae el importe exacto que vence en cada uno de los próximos 5 ejercicios y el <strong>tipo de interés cupón</strong> de cada bono o emisión. Si hubo una refinanciación en el año, calcula su impacto exacto sobre el BPA en dólares por acción.
                      </div>
                    </div>

                    <p class="guias-line-desc" style="margin-top: 10px;">
                      <strong>Ejemplo real (TAP, 10-K 2025):</strong> deuda neta de 5.403M$ (+226,2M$ vs 2024) y deuda bruta de 6.299,5M$, con un tipo de interés medio del 3,35 %. El calendario oficial está muy concentrado: <strong>2.424,7M$ vencen en 2026</strong> y prácticamente nada en 2027-2030 (0,5M / 0,5M / 1,7M / 0,5M), quedando 3.841,6M$ para después de 2030 (total 6.269,5M$, sin incluir arrendamientos financieros).
                    </p>
                    <figure class="guias-example-figure compact">
                      <img src="/imagenes/guias/tap-analisis-vencimientos.png?v=2" alt="Gráfico del calendario de vencimientos de deuda 2026-2030 del análisis de TAP 2025, con los compromisos concentrados en 2026 y el tipo de interés medio">
                      <figcaption>El calendario de vencimientos visto por el análisis: compromisos concentrados en 2026 y tipo de interés medio de la deuda.</figcaption>
                    </figure>
                    <figure class="guias-example-figure compact">
                      <img src="/imagenes/guias/tap-analisis-deuda-evolucion.png?v=2" alt="Gráfico de evolución de la deuda normal y neta de TAP entre 2016 y 2025 del análisis">
                      <figcaption>La evolución de la deuda (normal vs neta) del análisis, con la deuda neta en 5.403M$ en 2025.</figcaption>
                    </figure>
                  </div>

`;
}
function renderAnnualSection3() {
  return `                  <!-- 3. CAMBIOS EN LA CÚPULA DIRECTIVA -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">03</span>
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

                    <p class="guias-line-desc" style="margin-top: 10px; margin-bottom: 0;">
                      <strong>Ejemplo real (TAP, 10-K 2025):</strong> el 19 de septiembre de 2025 se anunció la sucesión: <strong>Rahul Goyal</strong> asumió como CEO el 1 de octubre de 2025, sustituyendo a <strong>Gavin D. K. Hattersley</strong>, que se jubiló tras liderar la compañía desde 2019 y permaneció como asesor hasta el 31 de diciembre de 2025.
                    </p>
                    <figure class="guias-example-figure compact">
                      <img src="/imagenes/guias/tap-analisis-direccion.png?v=2" alt="Sección de cambios en la dirección del análisis de TAP 2025 con el antiguo CEO Gavin Hattersley y el nuevo CEO Rahul Goyal">
                      <figcaption>La sección de cambios en la dirección del análisis: saliente y entrante con sus datos.</figcaption>
                    </figure>
                  </div>

`;
}
function renderAnnualSection4() {
  return `                  <!-- 4. ADQUISICIONES Y DESINVERSIONES -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">04</span>
                        <h5>Adquisiciones y Desinversiones <span class="guias-line-en-name">(M&A, Divestitures & Restructuring)</span></h5>
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

                    <p class="guias-line-desc" style="margin-top: 10px; margin-bottom: 0;">
                      <strong>Ejemplo real (TAP, 10-K 2025):</strong> adquisición de <strong>Fevertree USA, Inc.</strong> (derechos exclusivos para importar, producir, comercializar y distribuir productos Fever-Tree en EE. UU.) por <strong>22,3M$ en efectivo</strong>; desinversiones por <strong>15,8M$</strong> (venta de activos) y el <strong>Plan de Reestructuración de las Américas</strong> (35M$ previstos, de los que 28,7M$ ya se reconocieron en 2025).
                    </p>
                    <figure class="guias-example-figure compact">
                      <img src="/imagenes/guias/tap-analisis-adquisiciones.png?v=2" alt="Sección de operaciones corporativas del análisis de TAP 2025: plan de reestructuración de las Américas de 35M$ con 28,7M$ reconocidos">
                      <figcaption>La sección de operaciones corporativas del análisis, con el plan de reestructuración y sus cargos.</figcaption>
                    </figure>
                  </div>

`;
}
function renderAnnualSection5() {
  return `                  <!-- 5. EVOLUCIÓN DEL DIVIDENDO -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">05</span>
                        <h5>Evolución del Dividendo <span class="guias-line-en-name">(Dividend History & Sustainability)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Retribución Directa</span>
                    </div>
                    <p class="guias-line-desc">
                      La IA reconstruye la historia del dividendo de los últimos años: importe total repartido, dividendo por acción, crecimiento anual y acumulado (CAGR) y su cobertura real (payout sobre el BPA ajustado y sobre el Free Cash Flow, usando la fila <strong>Libre</strong>).
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Prueba de sostenibilidad:</strong> el dividendo debe quedar holgadamente cubierto por el <strong>FCF</strong> (referencia razonable: <code>Dividendos / FCF &lt; 60-70 %</code>). Un dividendo que crece más rápido que el beneficio y el flujo de caja acaba financiándose con deuda o con la caja acumulada, y la fila <code>Libre</code> de la Asignación de Capital es la primera en avisarlo.
                      </div>
                    </div>

                    <p class="guias-line-desc" style="margin-top: 10px; margin-bottom: 0;">
                      <strong>Ejemplo real (TAP, 10-K 2025):</strong> dividendo por acción de 0,68$ (2021) → 1,52$ (2022) → 1,64$ (2023) → 1,76$ (2024) → <strong>1,88$ (2025)</strong>, un +6,8 % en el último año (CAGR por acción del +28,9 % desde 2021). El pago total de 2025 fue de <strong>376,3M$</strong>, cubierto con holgura por un FCF de 1.067,8M$ y con un payout sobre BPA ajustado del <strong>34,7 %</strong>.
                    </p>
                    <figure class="guias-example-figure compact">
                      <img src="/imagenes/guias/tap-analisis-dividendos.png?v=2" alt="Sección de dividendos del análisis de TAP 2025: evolución del dividendo por acción y payout 2021-2025 y tabla anual">
                      <figcaption>La sección de dividendos del análisis: evolución y payout de los últimos 5 años con la tabla anual.</figcaption>
                    </figure>
                  </div>

`;
}
function renderAnnualSection6() {
  return `                  <!-- 6. OUTLOOK Y GUIDANCE OFICIAL -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">06</span>
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
                        <strong>Tabla de proyección en cifras monetarias reales:</strong> La IA prohíbe dejar términos ambiguos como «Flat» o simples porcentajes. Para cada métrica, calcula obligatoriamente la <strong>cifra monetaria proyectada en millones de dólares</strong> (ej. <em>Flat ±1% en ventas → ~$11.030M – $11.252M</em>), contrastada directamente contra la cifra lograda el año anterior.
                      </div>
                    </div>

                    <p class="guias-line-desc" style="margin-top: 10px; margin-bottom: 0;">
                      <strong>Ejemplo real (TAP, 10-K 2025):</strong> guidance 2026 de ventas en moneda constante planas ±1 % (~11.030–11.252M$ sobre los 11.141M$ de 2025), EBT subyacente −15 %/−18 % (~1.150–1.192M$), BPA diluido −11 %/−15 % (~4,93–5,16$), FCF subyacente 1.100M$ ±10 % y CAPEX 650M$ ±5 %.
                    </p>
                    <figure class="guias-example-figure compact">
                      <img src="/imagenes/guias/tap-analisis-outlook.png?v=2" alt="Sección de outlook del análisis de TAP 2025: metas cuantitativas 2026 con la tabla de guidance y la cifra proyectada en dólares">
                      <figcaption>La sección de outlook del análisis: cada meta del guidance convertida a cifra monetaria proyectada.</figcaption>
                    </figure>
                  </div>

`;
}
function renderAnnualSection7() {
  return `                  <!-- 7. NOTA DE RESULTADOS (1 A 10) -->
                  <div class="guias-line-card">
                    <div class="guias-line-card-head">
                      <div class="guias-line-card-title-wrap">
                        <span class="guias-line-number">07</span>
                        <h5>Nota de Resultados del 1 al 10 <span class="guias-line-en-name">(Annual Performance Score)</span></h5>
                      </div>
                      <span class="guias-line-type-badge highlight">Calificación Cifra</span>
                    </div>
                    <p class="guias-line-desc">
                      Cada informe anual culmina con una <strong>calificación numérica del 1 al 10</strong> acompañada de una justificación analítica concisa. Es una nota <strong>puramente de datos financieros</strong>: se calcula exclusivamente sobre lo que reflejan las cuentas del año (ventas, márgenes, conversión en caja, deuda y asignación de capital) y las metas cuantitativas expuestas en el outlook oficial. <strong>No se cuestiona si el outlook se va a cumplir o no</strong>, ni se valoran noticias, rumores o riesgos: todo eso queda fuera de la nota y es el inversor quien debe juzgarlo.
                    </p>
                    <div class="guias-line-rule-box green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <div>
                        <strong>Regla de estricta no especulación:</strong> La nota se fundamenta <strong>exclusivamente en hechos y cifras contables verificables</strong>: la calidad de las ventas y márgenes cerrados, la conversión en Free Cash Flow, el apalancamiento de deuda y el realismo de las metas del guidance. La IA tiene terminantemente prohibido especular sobre si la directiva «cumplirá o no» en el futuro.
                      </div>
                    </div>

                    <p class="guias-line-desc" style="margin-top: 10px; margin-bottom: 0;">
                      <strong>Ejemplo real (TAP, 10-K 2025):</strong> la nota del análisis fue un <strong>3/10</strong>, con la aclaración expresa de que es una calificación puramente financiera basada en las cuentas del año, el outlook oficial y la asignación de capital ejecutada, sin especulación sobre el cumplimiento futuro.
                    </p>
                    <figure class="guias-example-figure compact">
                      <img src="/imagenes/guias/tap-analisis-nota.png?v=2" alt="Nota de resultados del análisis de TAP 2025: 3/10, calificación puramente financiera sin especulación sobre el cumplimiento futuro">
                      <figcaption>La nota final del informe: 3/10, puramente financiera.</figcaption>
                    </figure>
                  </div>`;
}
function renderAnnualTail() {
  return `
                </div>
              </div>
            </article>
          </div>`;
}

function renderQuarterlyPanel(activeTabId) {
  return [
    renderQuarterlyIntro(activeTabId),
    renderQuarterlyBlock1(),
    renderQuarterlyBlock2(),
    renderQuarterlyBlock3(),
    renderQuarterlyTail(),
  ].join('');
}

function renderAnnualPanel(activeTabId) {
  return [
    renderAnnualIntro(activeTabId),
    renderAnnualSection1(),
    renderAnnualSection2(),
    renderAnnualSection3(),
    renderAnnualSection4(),
    renderAnnualSection5(),
    renderAnnualSection6(),
    renderAnnualSection7(),
    renderAnnualTail(),
  ].join('');
}

export function renderAnalisisIaContent(activeTabId) {
  return [
    renderIaTabs(activeTabId),
    renderQuarterlyPanel(activeTabId),
    renderAnnualPanel(activeTabId),
    `
        </div>
      </div>
    `,
  ].join('');
}
