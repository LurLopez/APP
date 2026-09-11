import { randomUUID } from 'node:crypto';
import { extractTextFromPdf } from './pdf.service.js';
import { aiContext } from './ai/modelProvider.js';
import { getAgent } from '../agents/agentRegistry.js';
import { generateReportPdf } from './report.service.js';
import { createAnalysis, updateAnalysis } from '../../db/repositories/analysisRepository.js';

const PERIOD_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function buildDownloadBase(report, formType) {
  const ticker = String(report?.ticker ?? '').replace(/[^\w.-]/g, '').toUpperCase() || 'INFORME';
  const year = Number(report?.fiscalYear)
    || (PERIOD_DATE_PATTERN.test(report?.reportingPeriod ?? '') ? Number(report.reportingPeriod.slice(0, 4)) : null)
    || new Date().getFullYear();
  const suffix = String(formType ?? '').includes('10-K')
    ? 'K'
    : report?.fiscalQuarter ? `Q${Number(report.fiscalQuarter)}` : 'FY';
  return `${ticker}-${year}-${suffix}`;
}

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

async function saveAnalysis({ userId, isPublic, filename, result, sourceUrl, accession, modelUsed }) {
  const report = result.report ?? {};
  const periodEnd = PERIOD_DATE_PATTERN.test(report.reportingPeriod ?? '') ? report.reportingPeriod : null;
  const parsedAccession = accession || (filename?.match(/[0-9]{10}-[0-9]{2}-[0-9]{6}/)?.[0] ?? null);

  const created = await createAnalysis({
    userId: userId ?? null,
    isPublic: Boolean(isPublic),
    filename,
    status: 'done',
    ticker: report.ticker ?? null,
    companyName: report.company ?? null,
    periodEnd,
    pdfUrl: result.pdfUrl ?? null,
    sourceUrl: sourceUrl ?? null,
    accession: parsedAccession,
  });

  return updateAnalysis(created.id, {
    origin: result.origin ?? null,
    sector: result.sector ?? null,
    report,
    model_used: modelUsed || process.env.AI_PROVIDER || null,
    accession: parsedAccession,
  });
}

export async function analyzeText(text, options = {}) {
  // Cada análisis usa su propia sesión de IA: varios análisis (de distintos
  // usuarios o del mismo) pueden ejecutarse en paralelo sin bloquearse entre sí.
  const sessionId = options.sessionId || randomUUID();
  return aiContext.run({ sessionId }, () => runAnalysis(text, options, sessionId));
}

async function runAnalysis(text, options, sessionId) {
  console.log(`[analysis] sesión IA ${sessionId.slice(0, 8)} · ${options.filename ?? 'informe'}`);
  const originAgent = getAgent('origin');
  const originResult = await originAgent.run({ text });

  const effectiveFormType = options.formType || originResult.formType;

  const sectorAgent = getAgent('sector');
  const sectorResult = await sectorAgent.run({ text });

  const analystAgent = getAgent('analyst');
  const report = await analystAgent.run({
    text,
    presentationText: options.presentationText ?? null,
    sector: sectorResult.sector,
    formType: effectiveFormType,
    ticker: options.ticker ?? null,
  });

  const { url, docxUrl, odtUrl } = await generateReportPdf(report);

  const result = {
    text,
    origin: originResult.origin,
    formType: effectiveFormType,
    sector: sectorResult.sector,
    report,
    pdfUrl: url,
    docxUrl,
    odtUrl,
    downloadBase: buildDownloadBase(report, effectiveFormType),
  };

  let saved = null;
  try {
    saved = await saveAnalysis({
      userId: options.userId ?? null,
      isPublic: options.isPublic === true,
      filename: options.filename ?? 'informe.pdf',
      sourceUrl: options.sourceUrl ?? null,
      accession: options.accession ?? null,
      modelUsed: options.modelUsed ?? null,
      result,
    });
  } catch (error) {
    console.error('[analysis:save]', error.message);
  }

  result.analysisId = saved?.id ?? null;
  return result;
}

export async function analyzePdf(buffer, options = {}) {
  const text = await extractTextFromPdf(buffer);
  return analyzeText(text, options);
}

export async function buildPresentationText(presentations) {
  if (!Array.isArray(presentations) || !presentations.length) return null;
  const processed = [];

  for (const presentation of presentations) {
    try {
      let text = null;
      if (presentation.kind === 'html') {
        text = htmlToText(presentation.buffer.toString('utf8'));
      } else {
        text = await extractTextFromPdf(presentation.buffer);
      }
      if (text && text.trim().length > 200) {
        const extracted = extractRelevantPresentationSections(text.trim(), 24000);
        if (extracted && extracted.length > 100) {
          const hasGuidance = /(?:202\d|fiscal|full[- ]?year)?\s*(?:financial\s+|business\s+)?(?:outlook|guidance|targets|perspectivas)/i.test(extracted);
          processed.push({
            name: presentation.name,
            extracted,
            hasGuidance,
          });
        }
      }
    } catch (err) {
      console.warn('[buildPresentationText]', presentation.name, err.message);
    }
  }

  // Priorizar documentos que contienen explícitamente secciones de guidance / outlook
  processed.sort((a, b) => (b.hasGuidance ? 1 : 0) - (a.hasGuidance ? 1 : 0));

  const parts = processed.map((doc) => {
    const badge = doc.hasGuidance ? ' [CONTIENE SECCIÓN DE GUIDANCE / OUTLOOK]' : '';
    return `### DOCUMENTO COMPLEMENTARIO: ${doc.name}${badge}\n${doc.extracted}`;
  });

  return parts.length ? parts.join('\n\n---\n\n') : null;
}

export function extractRelevantPresentationSections(text, maxChars = 24000) {
  if (!text) return '';
  const clean = String(text).trim();
  if (clean.length <= maxChars) return clean;

  const sections = [];

  // 1. Cabecera y titulares principales (primeros 3500 caracteres)
  sections.push({
    start: 0,
    end: Math.min(clean.length, 3500),
    priority: 2,
    label: 'RESUMEN EJECUTIVO',
  });

  // 2. Secciones específicas de Outlook / Guidance para el nuevo ejercicio
  // Prioridad 0 (máxima): menciones explícitas de Outlook / Guidance con año o "full year / fiscal"
  const specificGuidanceRegex = /(?:(?:202\d|fiscal(?:\s+year|\s+\d{2,4})?|full[- ]?year)\s*(?:financial\s+|business\s+)?(?:outlook|guidance|targets|perspectivas)|(?:outlook|guidance|perspectivas)\s*(?:for|para)?\s*(?:full\s+year|fiscal\s+year|\b202\d\b))/gi;
  let match;
  let foundSpecific = false;
  while ((match = specificGuidanceRegex.exec(clean)) !== null) {
    foundSpecific = true;
    const start = Math.max(0, match.index - 200);
    const end = Math.min(clean.length, match.index + 4500);
    sections.push({
      start,
      end,
      priority: 0,
      label: 'GUIDANCE / OUTLOOK',
    });
  }

  // Fallback si no se encontró con año explícito: cualquier mención de "outlook" o "guidance"
  if (!foundSpecific) {
    const genericGuidanceRegex = /\b(?:outlook|guidance|financial targets)\b/gi;
    while ((match = genericGuidanceRegex.exec(clean)) !== null) {
      const start = Math.max(0, match.index - 200);
      const end = Math.min(clean.length, match.index + 3500);
      sections.push({
        start,
        end,
        priority: 1,
        label: 'GUIDANCE / OUTLOOK',
      });
    }
  }

  // 3. Recompras, asignación de capital o programas de ahorro de costes
  const capitalRegex = /(?:share repurchase|repurchase program|capital allocation|cost savings program|cost savings plan)/gi;
  while ((match = capitalRegex.exec(clean)) !== null) {
    const start = Math.max(0, match.index - 150);
    const end = Math.min(clean.length, match.index + 2000);
    sections.push({
      start,
      end,
      priority: 3,
      label: 'CAPITAL / RECOMPRAS / AHORRO',
    });
  }

  // Fusionar intervalos solapados o contiguos (hasta 200 caracteres de separación)
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

  // Ordenar por prioridad para asegurar que Guidance y Resumen entran en el presupuesto
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

  // Reordenar secuencialmente por posición en el documento original
  picked.sort((a, b) => a.start - b.start);

  const parts = [];
  for (const p of picked) {
    const snippet = clean.slice(p.start, p.end).trim();
    if (snippet) {
      parts.push(snippet);
    }
  }

  return parts.join('\n\n[...]\n\n');
}
