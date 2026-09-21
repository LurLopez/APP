/**
 * @fileoverview Extractor inteligente de secciones clave (guidance, outlook, recompras) en presentaciones de resultados 8-K.
 * @module services/analysis/presentationExtractor
 */

import { extractTextFromPdf } from '../pdf.service.js';

/**
 * Convierte código HTML a texto plano limpio sin scripts, estilos ni etiquetas.
 * @param {string} html - Fragmento HTML.
 * @returns {string} Texto plano limpio.
 */
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrae secciones prioritarias (outlook, guidance, recompras y resumen ejecutivo) de un documento complementario.
 * @param {string} text - Texto del documento.
 * @param {number} [maxChars=24000] - Límite de caracteres para no desbordar contexto del LLM.
 * @returns {string} Texto condensado con las partes relevantes unidas por elipsis.
 */
export function extractRelevantPresentationSections(text, maxChars = 24000) {
  if (!text) return '';
  const clean = String(text).trim();
  if (clean.length <= maxChars) return clean;

  const sections = [];

  // Resumen ejecutivo inicial
  sections.push({
    start: 0,
    end: Math.min(clean.length, 3500),
    priority: 2,
    label: 'RESUMEN EJECUTIVO',
  });

  // Secciones específicas de Outlook / Guidance con menciones de año o ejercicio
  const specificGuidanceRegex = /(?:(?:202\d|fiscal(?:\s+year|\s+\d{2,4})?|full[- ]?year)\s*(?:financial\s+|business\s+)?(?:outlook|guidance|targets|perspectivas)|(?:outlook|guidance|perspectivas)\s*(?:for|para)?\s*(?:full\s+year|fiscal\s+year|\b202\d\b))/gi;
  let match;
  let foundSpecific = false;
  while ((match = specificGuidanceRegex.exec(clean)) !== null) {
    foundSpecific = true;
    sections.push({
      start: Math.max(0, match.index - 200),
      end: Math.min(clean.length, match.index + 4500),
      priority: 0,
      label: 'GUIDANCE / OUTLOOK',
    });
  }

  // Fallback para menciones genéricas de metas financieras
  if (!foundSpecific) {
    const genericGuidanceRegex = /\b(?:outlook|guidance|financial targets)\b/gi;
    while ((match = genericGuidanceRegex.exec(clean)) !== null) {
      sections.push({
        start: Math.max(0, match.index - 200),
        end: Math.min(clean.length, match.index + 3500),
        priority: 1,
        label: 'GUIDANCE / OUTLOOK',
      });
    }
  }

  // Asignación de capital, recompras de acciones y planes de ahorro
  const capitalRegex = /(?:share repurchase|repurchase program|capital allocation|cost savings program|cost savings plan)/gi;
  while ((match = capitalRegex.exec(clean)) !== null) {
    sections.push({
      start: Math.max(0, match.index - 150),
      end: Math.min(clean.length, match.index + 2000),
      priority: 3,
      label: 'CAPITAL / RECOMPRAS / AHORRO',
    });
  }

  // Fusionar intervalos solapados o contiguos
  sections.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const s of sections) {
    if (!merged.length) {
      merged.push({ ...s });
    } else {
      const last = merged[merged.length - 1];
      if (s.start <= last.end + 200) {
        last.end = Math.max(last.end, s.end);
        last.priority = Math.min(last.priority, s.priority);
      } else {
        merged.push({ ...s });
      }
    }
  }

  // Filtrar por presupuesto de caracteres según prioridad
  let currentLength = 0;
  const picked = [];
  const byPriority = [...merged].sort((a, b) => a.priority - b.priority);
  for (const range of byPriority) {
    const len = range.end - range.start;
    if (currentLength + len <= maxChars) {
      picked.push(range);
      currentLength += len;
    } else {
      const available = maxChars - currentLength;
      if (available > 600) {
        picked.push({ ...range, end: range.start + available });
        currentLength += available;
      }
      break;
    }
  }

  picked.sort((a, b) => a.start - b.start);
  return picked
    .map((p) => clean.slice(p.start, p.end).trim())
    .filter(Boolean)
    .join('\n\n[...]\n\n');
}

/**
 * Procesa un listado de presentaciones complementarias (PDF o HTML) y construye el bloque de contexto estructurado.
 * @param {Array<{ name: string, buffer: Buffer, kind: string }>} presentations - Documentos adjuntos.
 * @returns {Promise<string|null>} Bloque formateado para el modelo o null si no hay datos.
 */
export async function buildPresentationText(presentations) {
  if (!Array.isArray(presentations) || !presentations.length) return null;
  const processed = [];

  for (const presentation of presentations) {
    try {
      const text = presentation.kind === 'html'
        ? htmlToText(presentation.buffer.toString('utf8'))
        : await extractTextFromPdf(presentation.buffer);

      if (text && text.trim().length > 200) {
        const extracted = extractRelevantPresentationSections(text.trim(), 24000);
        if (extracted && extracted.length > 100) {
          const hasGuidance = /(?:202\d|fiscal|full[- ]?year)?\s*(?:financial\s+|business\s+)?(?:outlook|guidance|targets|perspectivas)/i.test(extracted);
          processed.push({ name: presentation.name, extracted, hasGuidance });
        }
      }
    } catch (err) {
      console.warn('[buildPresentationText]', presentation.name, err.message);
    }
  }

  processed.sort((a, b) => (b.hasGuidance ? 1 : 0) - (a.hasGuidance ? 1 : 0));

  const parts = processed.map((doc) => {
    const badge = doc.hasGuidance ? ' [CONTIENE SECCIÓN DE GUIDANCE / OUTLOOK]' : '';
    return `### DOCUMENTO COMPLEMENTARIO: ${doc.name}${badge}\n${doc.extracted}`;
  });

  return parts.length ? parts.join('\n\n---\n\n') : null;
}
