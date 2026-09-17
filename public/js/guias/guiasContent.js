/**
 * @fileoverview Contenido de la sección «Guías» de Cifra (apartados, sub-pestañas
 * y paneles con el texto completo). Fuente única compartida por la interfaz
 * (public/guias.js) y por el renderizado SSR para buscadores y LLMs
 * (src/services/seo/guidesSeo.service.js): lo que ven los usuarios en la pestaña
 * Guías es exactamente lo que reciben los rastreadores en /guias.
 *
 * Los bloques viven en módulos especializados: `guiasData` (datos de navegación),
 * `guiasAvisoContent`, `guiasDatosFinancierosContent` y `guiasAnalisisIaContent`.
 * @module guiasContent
 */

export { escapeHtml } from './guiasHtml.js';
export {
  APARTADOS,
  APARTADOS_VISIBLES,
  DATOS_FINANCIEROS_TABS,
  ANALISIS_IA_TABS,
} from './guiasData.js';
export { renderAvisoPanelContent } from './guiasAvisoContent.js';
export { renderDatosFinancierosContent } from './guiasDatosFinancierosContent.js';
export { renderAnalisisIaContent } from './guiasAnalisisIaContent.js';
