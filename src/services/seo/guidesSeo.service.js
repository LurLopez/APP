/**
 * @fileoverview Renderizado SSR de la página `/guias` para buscadores y LLMs.
 * Reutiliza exactamente el contenido de la pestaña «Guías» de la aplicación
 * (`public/js/guias/guiasContent.js`), de modo que el HTML servido a los
 * rastreadores coincide con lo que ve el usuario en la interfaz.
 * @module services/seo/guidesSeo
 */

import {
  APARTADOS_VISIBLES,
  renderAvisoPanelContent,
  renderDatosFinancierosContent,
  renderAnalisisIaContent,
} from '../../../public/js/guias/guiasContent.js';
import { botContentWrap } from './botContent.service.js';
import { translateHtmlToEnglish } from './seoConstants.js';
import { getPageMeta } from './pageMeta.service.js';

const INTRO = 'Guías y documentación sobre datos financieros, cartera y análisis con IA.';
const INTRO_EN = 'Guides and documentation on financial data, portfolio management and AI analysis.';

/**
 * Devuelve el título y la descripción de la página de guías según el idioma.
 * @param {string} [lang] - Idioma ('es' | 'en').
 * @returns {{ title: string, description: string }}
 */
export function getGuidesSeoMeta(lang = 'es') {
  return getPageMeta('guides', lang);
}

/**
 * Convierte el HTML de la interfaz en HTML válido para incrustar en el SSR:
 * elimina ids (evita duplicados con la SPA), atributos de pestañas y estados
 * ocultos para que todo el contenido quede visible a los rastreadores.
 * @private
 * @param {string} html - Fragmento HTML generado por el módulo de contenido.
 * @returns {string}
 */
function sanitizeSeoHtml(html) {
  return String(html).replace(/<[^>]+>/g, (tag) => tag
    .replace(/\s+id="[^"]*"/g, '')
    .replace(/\shidden(?=[\s>])/g, '')
    .replace(/\s+(?:role|tabindex|aria-[a-z-]+|data-[a-z-]+)="[^"]*"/g, '')
    .replace(/^<img\b(?![^>]*\bloading=)/, '<img loading="lazy"'));
}

const contentCache = new Map();

/**
 * Construye el contenido SSR de `/guias` con los tres apartados de la pestaña
 * (Aviso y Proyecto, Datos Financieros y Análisis con IA) completos.
 * @param {string} [lang] - Idioma ('es' | 'en').
 * @returns {string} HTML envuelto en el bloque de contenido público.
 */
export function getGuidesSeoContent(lang = 'es') {
  const key = lang === 'en' ? 'en' : 'es';
  if (!contentCache.has(key)) contentCache.set(key, buildGuidesSeoContent(key));
  return contentCache.get(key);
}

/**
 * Genera el HTML SSR completo a partir de los paneles de la interfaz.
 * @private
 * @param {'es'|'en'} lang - Idioma.
 * @returns {string}
 */
function buildGuidesSeoContent(lang) {
  const isEn = lang === 'en';
  const parts = [];

  parts.push(`<h1>${isEn ? 'Guides' : 'Guías'}</h1>`);
  parts.push(`<p>${isEn ? INTRO_EN : INTRO}</p>`);

  for (const apartado of APARTADOS_VISIBLES) {
    const content = apartado.id === 'aviso'
      ? renderAvisoPanelContent()
      : apartado.id === 'datos-financieros'
        ? renderDatosFinancierosContent('cuenta-resultados')
        : apartado.id === 'analisis-ia'
          ? renderAnalisisIaContent('trimestral')
          : '';
    parts.push(`<h2>${apartado.nombre}</h2>`);
    parts.push(`<p>${apartado.descripcion}</p>`);
    parts.push(content);
  }

  let inner = sanitizeSeoHtml(parts.join('\n'));
  if (isEn) inner = translateHtmlToEnglish(inner);
  return botContentWrap(inner, lang);
}
