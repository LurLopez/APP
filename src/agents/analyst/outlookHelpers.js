/**
 * @fileoverview Funciones auxiliares para la construcción, completado y combinación de tablas de guidance/outlook.
 * @module agents/analyst/outlookHelpers
 */

export { withOutlookComparison } from './outlookProjections.js';
export { completeOutlookPriorColumn, mergeOutlookRows } from './outlookMerge.js';

/**
 * Parsea un valor numérico flexible desde texto o número.
 * @param {string|number|null} val - Valor bruto.
 * @returns {number|null} Valor numérico o null.
 */

/**
 * Formatea un número como importe monetario en millones.
 * @param {number|null} n - Cifra en millones.
 * @returns {string} Texto formateado en millones ($XM).
 */

/**
 * Formatea un número como EPS / BPA con dos decimales.
 * @param {number|null} n - Cifra por acción.
 * @returns {string} Texto formateado ($X.XX).
 */

/**
 * Extrae el porcentaje de variación o rango desde un texto de guidance.
 * @param {string} g - Texto de guidance.
 * @returns {{minP: number, maxP: number}|null} Rango porcentual en decimales o null.
 */

/**
 * Proyecta la fila de ventas netas / ingresos.
 * @param {string} g - Guidance.
 * @param {number|null} prevSalesVal - Ventas del ejercicio anterior.
 * @param {number} prevYear - Año anterior.
 * @returns {string} Proyección calculada.
 */

/**
 * Proyecta la fila de EBT o resultado operativo.
 * @param {string} g - Guidance.
 * @param {number|null} prevEbtVal - EBT del ejercicio anterior.
 * @returns {string} Proyección calculada.
 */

/**
 * Proyecta la fila de EPS.
 * @param {string} g - Guidance.
 * @param {number|null} prevEpsVal - EPS del ejercicio anterior.
 * @returns {string} Proyección calculada.
 */

/**
 * Proyecta la fila de Free Cash Flow.
 * @param {string} g - Guidance.
 * @param {number|null} prevEbtVal - EBT previo.
 * @returns {string} Proyección calculada.
 */

/**
 * Proyecta la fila de CAPEX o depreciaciones.
 * @param {string} g - Guidance.
 * @returns {string} Proyección calculada.
 */

/**
 * Genera la comparación enriquecida para una fila individual de guidance.
 */

/**
 * Añade columnas de comparación (año anterior y proyección) a la tabla de guidance.
 * @param {object} snippet - Snippet de guidance con rows y headers.
 * @param {object} report - Reporte de análisis con horizontes financieros.
 * @returns {object} Snippet enriquecido.
 */

/**
 * Completa la columna de año anterior en la tabla de guidance usando la extracción oficial.
 * @param {object} snippet - Tabla de guidance.
 * @param {object} extractionOutlook - Métricas extraídas del 10-K / 8-K.
 * @returns {object} Snippet completado.
 */

/**
 * Clave normalizada para comparar nombres de métricas.
 * @param {string} label - Nombre de métrica.
 * @returns {string} Clave canónica.
 */

/**
 * Une a la tabla final de guidance las filas oficiales extraídas que el modelo haya omitido.
 * @param {object} finalSnippet - Tabla final de guidance.
 * @param {object} extractionSnippet - Tabla extraída del filing.
 * @returns {object} Tabla combinada.
 */
