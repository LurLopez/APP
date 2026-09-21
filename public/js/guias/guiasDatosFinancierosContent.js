/**
 * @fileoverview Paneles de la sub-pestaña «Datos Financieros» de las Guías:
 * cuenta de resultados, balance de situación y estado de flujos de caja.
 * @module guiasDatosFinancierosContent
 */

import { DATOS_FINANCIEROS_TABS } from './guiasData.js';
import { escapeHtml } from './guiasHtml.js';

function renderDatosTabs(activeTabId) {
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
`;
}
function renderIncomeIntro(activeTabId) {
  return `          <!-- 1. CUENTA DE RESULTADOS -->
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
`;
}
function renderIncomeCard01() {
  return `                  <!-- LÍNEA 1: INGRESOS -->
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

`;
}
function renderIncomeCard02() {
  return `                  <!-- LÍNEA 2: BENEFICIO BRUTO -->
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

`;
}
function renderIncomeCard03() {
  return `                  <!-- LÍNEA 3: GASTOS EN I+D -->
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

`;
}
function renderIncomeCard04() {
  return `                  <!-- LÍNEA 4: AMORTIZACIÓN Y DETERIORO DE FONDOS DE COMERCIO Y ACTIVOS INTANGIBLES -->
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

`;
}
function renderIncomeCard05() {
  return `                  <!-- LÍNEA 5: BENEFICIO OPERATIVO Y OPERATIVO AJUSTADO -->
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

`;
}
function renderIncomeCard06() {
  return `                  <!-- LÍNEA 6: GASTOS POR INTERESES -->
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

`;
}
function renderIncomeCard07() {
  return `                  <!-- LÍNEA 7: DEVALUACIÓN DE ACTIVOS TANGIBLES -->
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

`;
}
function renderIncomeCard08() {
  return `                  <!-- LÍNEA 8: EBT (BENEFICIO ANTES DE IMPUESTOS) -->
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

`;
}
function renderIncomeCard09() {
  return `                  <!-- LÍNEA 9: BENEFICIO NETO E IMPUESTOS -->
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
                  </div>`;
}
function renderIncomeTail() {
  return `
                </div>
              </div>
            </article>
          </div>

`;
}
function renderBalanceIntro(activeTabId) {
  return `          <!-- 2. BALANCE DE SITUACIÓN -->
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
`;
}
function renderBalanceCard01() {
  return `                  <!-- LÍNEA 1: EFECTIVO Y EQUIVALENTES -->
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

`;
}
function renderBalanceCard02() {
  return `                  <!-- LÍNEA 2: CUENTAS POR COBRAR -->
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

`;
}
function renderBalanceCard03() {
  return `                  <!-- LÍNEA 3: INVENTARIO -->
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

`;
}
function renderBalanceCard04() {
  return `                  <!-- LÍNEA 4: CUENTAS POR PAGAR -->
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

`;
}
function renderBalanceCard05() {
  return `                  <!-- MÓDULO EDUCATIVO DESTACADO: EL IMPACTO EN EL CIRCULANTE Y LA INFLACIÓN -->
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

`;
}
function renderBalanceCard06() {
  return `                  <!-- LÍNEA 5: FONDO DE COMERCIO E INTANGIBLES -->
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

`;
}
function renderBalanceCard07() {
  return `                  <!-- LÍNEA 6: INMOVILIZADO MATERIAL BRUTO -->
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

`;
}
function renderBalanceCard08() {
  return `                  <!-- LÍNEA 7: INVERSIONES A LARGO PLAZO -->
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

`;
}
function renderBalanceCard09() {
  return `                  <!-- LÍNEA 8: PRÉSTAMOS A CORTO PLAZO -->
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

`;
}
function renderBalanceCard10() {
  return `                  <!-- LÍNEA 9: DEUDA A LARGO PLAZO -->
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

`;
}
function renderBalanceCard11() {
  return `                  <!-- LÍNEA 10: FONDOS PROPIOS / PATRIMONIO NETO -->
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

`;
}
function renderBalanceCard12() {
  return `                  <!-- LÍNEA 11: DEUDA NETA -->
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
                  </div>`;
}
function renderBalanceTail() {
  return `
                </div>
              </div>
            </article>
          </div>

`;
}
function renderCashFlowIntro(activeTabId) {
  return `          <!-- 3. CASH FLOWS (ESTADO DE FLUJOS DE EFECTIVO) -->
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
`;
}
function renderCashFlowCard01() {
  return `                  <!-- LÍNEA 1: COMPENSACIÓN EN STOCK OPTIONS -->
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
                        <strong>La trampa de la dilución:</strong> Aunque no salga dinero de la caja hoy, <strong>está diluyendo directamente nuestras acciones</strong>: cada año se emiten nuevos títulos que reducen nuestra participación en la empresa. Además, las stock options se conceden con un descuento respecto a la cotización real de mercado. Por ello, para realizar un análisis de valoración conservador y realista, <strong>es altamente recomendable descontar el importe íntegro de esa línea del Free Cash Flow</strong> para imputar el coste económico real que soporta el accionista por la dilución.
                      </div>
                    </div>
                  </div>

`;
}
function renderCashFlowCard02() {
  return `                  <!-- LÍNEA 2: CAMBIO EN EL CIRCULANTE -->
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

`;
}
function renderCashFlowCard03() {
  return `                  <!-- LÍNEA 3: EFECTIVO DE OPERACIONES -->
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

`;
}
function renderCashFlowCard04() {
  return `                  <!-- LÍNEA 4: CAPEX -->
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

`;
}
function renderCashFlowCard05() {
  return `                  <!-- LÍNEA 5: ADQUISICIONES -->
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

`;
}
function renderCashFlowCard06() {
  return `                  <!-- LÍNEA 6: RECOMPRAS DE ACCIONES -->
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

`;
}
function renderCashFlowCard07() {
  return `                  <!-- LÍNEA 7: DIVIDENDOS -->
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
                  </div>`;
}
function renderCashFlowTail() {
  return `
                </div>
              </div>
            </article>
          </div>`;
}

function renderIncomeStatementPanel(activeTabId) {
  return [
    renderIncomeIntro(activeTabId),
    renderIncomeCard01(),
    renderIncomeCard02(),
    renderIncomeCard03(),
    renderIncomeCard04(),
    renderIncomeCard05(),
    renderIncomeCard06(),
    renderIncomeCard07(),
    renderIncomeCard08(),
    renderIncomeCard09(),
    renderIncomeTail(),
  ].join('');
}
function renderBalanceSheetPanel(activeTabId) {
  return [
    renderBalanceIntro(activeTabId),
    renderBalanceCard01(),
    renderBalanceCard02(),
    renderBalanceCard03(),
    renderBalanceCard04(),
    renderBalanceCard05(),
    renderBalanceCard06(),
    renderBalanceCard07(),
    renderBalanceCard08(),
    renderBalanceCard09(),
    renderBalanceCard10(),
    renderBalanceCard11(),
    renderBalanceCard12(),
    renderBalanceTail(),
  ].join('');
}
function renderCashFlowPanel(activeTabId) {
  return [
    renderCashFlowIntro(activeTabId),
    renderCashFlowCard01(),
    renderCashFlowCard02(),
    renderCashFlowCard03(),
    renderCashFlowCard04(),
    renderCashFlowCard05(),
    renderCashFlowCard06(),
    renderCashFlowCard07(),
    renderCashFlowTail(),
  ].join('');
}

export function renderDatosFinancierosContent(activeTabId) {
  return [
    renderDatosTabs(activeTabId),
    renderIncomeStatementPanel(activeTabId),
    renderBalanceSheetPanel(activeTabId),
    renderCashFlowPanel(activeTabId),
    `
        </div>
      </div>
    `,
  ].join('');
}
