/**
 * @fileoverview Generadores de contenido Markdown estructurado para agentes IA, GEO y endpoints .md.
 * @module services/seo/markdownSeo.service
 */

import config from '../../../config/index.js';
import { filingPeriodLabel } from '../edgar.service.js';
import { titleCaseName, formatUsdMillions, formatUsdShare } from './seoConstants.js';
import { buildCompanyMeta } from './companyMeta.service.js';
import { getCompanySeoContent } from './botContent.service.js';
import {
  buildReportSlug,
  loadPublicReportRow,
  loadPublicReportBySlug,
} from './reportSeo.service.js';

export async function getCompanyMarkdown(ticker) {
  const meta = await buildCompanyMeta(ticker);
  if (!meta) return null;
  const content = await getCompanySeoContent(meta.ticker);
  const site = config.siteUrl;
  const lines = [];

  lines.push(`# ${meta.name} (${meta.ticker}) — Análisis Financiero y Resultados SEC`);
  lines.push('');
  lines.push(`> Fuente oficial primaria: SEC EDGAR (CIK: ${meta.cik ?? 'n/d'}). Cotiza en ${meta.exchange ?? 'Bolsa de EE. UU.'}.`);
  if (meta.sector) lines.push(`> Sector: ${meta.sector}${meta.industry ? ` · Industria: ${meta.industry}` : ''}`);
  lines.push(`> URL Canónica: ${meta.url}`);
  lines.push('');
  lines.push('## Perfil del Negocio');
  lines.push('');
  lines.push(meta.description);
  lines.push('');

  if (content.annual.length) {
    const latest = content.annual[0];
    const rev = formatUsdMillions(latest.revenue);
    const net = formatUsdMillions(latest.netIncome);
    const fcf = formatUsdMillions(latest.freeCashFlow);
    const eps = formatUsdShare(latest.epsDiluted);
    const fcfMargin = latest.revenue && latest.freeCashFlow ? Math.round((Number(latest.freeCashFlow) / Number(latest.revenue)) * 100) : null;
    lines.push('## Resumen Financiero Ejecutivo');
    lines.push('');
    lines.push(`En su ejercicio fiscal más reciente (${latest.year}), ${meta.name} reportó ventas de ${rev ?? '—'}${net ? `, beneficio neto de ${net}` : ''}${fcf ? ` y un flujo de caja libre (FCF) de ${fcf}` : ''}${fcfMargin !== null ? ` (margen FCF del ${fcfMargin}%)` : ''}${eps ? ` (beneficio por acción diluido de ${eps})` : ''}.`);
    lines.push('');
    lines.push('## Resultados Financieros Anuales (Últimos Ejercicios)');
    lines.push('');
    lines.push('| Ejercicio | Ventas (Revenue) | Beneficio Neto | Flujo de Caja Libre (FCF) | EPS Diluido |');
    lines.push('|---|---|---|---|---|');
    for (const row of content.annual) {
      lines.push(`| ${row.year} | ${formatUsdMillions(row.revenue) ?? '—'} | ${formatUsdMillions(row.netIncome) ?? '—'} | ${formatUsdMillions(row.freeCashFlow) ?? '—'} | ${formatUsdShare(row.epsDiluted) ?? '—'} |`);
    }
    lines.push('');
  }

  if (content.filings.length) {
    lines.push('## Informes 10-Q y 10-K Presentados ante la SEC');
    lines.push('');
    for (const f of content.filings) {
      const period = filingPeriodLabel(f.form, f.period);
      const url = f.documentUrl ?? `https://www.sec.gov/edgar/browse/?CIK=${meta.cik}`;
      lines.push(`- [${f.form} (${period || f.filedAt})](${url}) — Presentado el ${f.filedAt}`);
    }
    lines.push('');
  }

  if (content.publicReports.length) {
    lines.push('## Informes Analizados con IA en Cifra');
    lines.push('');
    const seenSlugs = new Set();
    for (const r of content.publicReports) {
      const slug = r.slug || buildReportSlug(r);
      if (seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);
      let formType = r.formType;
      if (!formType) {
        formType = /annual|full year|10-?k/i.test(r.periodTitle || '') ? '10-K' : '10-Q';
      }
      const repUrl = `${site}/informe/${encodeURIComponent(r.ticker)}/${slug}`;
      lines.push(`- [Informe ${formType} ${r.periodTitle ?? ''}](${repUrl}) ([Markdown](${repUrl}.md))`);
    }
    lines.push('');
  }

  lines.push('## Preguntas Frecuentes');
  lines.push('');
  lines.push(`### ¿En qué sector e industria opera ${meta.name}?`);
  lines.push(`${meta.name} (${meta.ticker}) cotiza en ${meta.exchange ?? 'la bolsa de EE. UU.'} y opera en la industria de ${meta.industry ?? meta.sector ?? 'consumo defensivo'} (sector consumo defensivo en SEC EDGAR).`);
  lines.push('');
  lines.push(`### ¿Dónde consultar los filings oficiales de ${meta.ticker}?`);
  lines.push(`En el sistema oficial SEC EDGAR bajo el CIK ${meta.cik} (https://www.sec.gov/edgar) o en la ficha interactiva de Cifra (${meta.url}).`);
  lines.push('');
  lines.push('## Cita y Atribución');
  lines.push('');
  lines.push(`Datos extraídos de SEC EDGAR. Análisis estructurado por Cifra (${site}). Con fines exclusivamente informativos.`);

  return lines.join('\n');
}

export function buildReportMarkdown(row) {
  if (!row) return null;
  const report = row.report ?? {};
  const ticker = String(row.ticker ?? report.ticker ?? '').toUpperCase();
  const company = report.company ?? row.company_name ?? ticker;
  const name = titleCaseName(company);
  let formType = report.formType ?? '';
  if (!formType) {
    formType = (report.periodTitle?.includes('10-K') || report.isAnnual === true) ? '10-K' : '10-Q';
  }
  const isAnnual = report.isAnnual === true || formType === '10-K';
  const fyLabel = report.periodTitle
    ? report.periodTitle
    : (isAnnual ? `FY ${report.fiscalYear ?? ''}` : `Q${report.fiscalQuarter ?? ''} ${report.fiscalYear ?? ''}`);
  const site = config.siteUrl;
  const slug = buildReportSlug(row);
  const canonicalUrl = `${site}/informe/${encodeURIComponent(ticker)}/${slug}`;

  const lines = [];
  lines.push(`# Informe ${formType} de ${name} (${ticker}) — ${fyLabel}`);
  lines.push('');
  lines.push(`> Empresa: ${name} (${ticker})`);
  lines.push(`> Formulario: ${formType} · Periodo: ${fyLabel.trim()}`);
  lines.push(`> Fecha de publicación: ${new Date(row.created_at).toISOString().slice(0, 10)}`);
  if (row.source_url) lines.push(`> Fuente oficial: [SEC EDGAR Filing](${row.source_url})`);
  if (row.pdf_url) lines.push(`> Descargar PDF: ${site}${row.pdf_url}`);
  lines.push(`> URL Canónica: ${canonicalUrl}`);
  lines.push('');

  if (report.rating?.label) {
    lines.push(`**Calificación Cifra:** ${report.rating.label}${report.rating.rationale ? ` — ${report.rating.rationale}` : ''}`);
    lines.push('');
  }

  for (const horizon of report.horizons ?? []) {
    lines.push(`## ${horizon.label ?? 'Análisis'}`);
    lines.push('');
    if (horizon.sales?.rows?.length) {
      lines.push('### Ventas y Cuenta de Resultados');
      if (horizon.sales.eps) lines.push(`- **BPA / EPS:** ${horizon.sales.eps}`);
      if (horizon.sales.shares) lines.push(`- **Acciones en circulación:** ${horizon.sales.shares}`);
      lines.push('');
      lines.push('| Concepto | Actual | Anterior | Variación |');
      lines.push('|---|---|---|---|');
      for (const r of horizon.sales.rows) {
        const act = r.isAdjusted ? (r.adjusted ?? r.normal) : r.normal;
        const prev = r.isAdjusted ? (r.prevAdjusted ?? r.prevNormal) : r.prevNormal;
        const varPct = r.isAdjusted ? (r.pctAdjusted ?? r.pctNormal) : (r.pctNormal ?? '—');
        lines.push(`| ${r.name} | ${act ?? '—'} | ${prev ?? '—'} | ${varPct ?? '—'} |`);
      }
      lines.push('');
      if (horizon.sales.notes?.length) {
        for (const note of horizon.sales.notes) lines.push(`> ${note}`);
        lines.push('');
      }
    }
    if (horizon.cashFlow?.rows?.length) {
      lines.push('### Flujo de Caja');
      lines.push('');
      lines.push('| Concepto | Normal | Ajustado |');
      lines.push('|---|---|---|');
      for (const r of horizon.cashFlow.rows) {
        lines.push(`| ${r.name} | ${r.values?.[0] ?? '—'} | ${r.values?.[1] ?? '—'} |`);
      }
      lines.push('');
      if (horizon.cashFlow.scenarios?.length) {
        lines.push(`**Escenarios:** ${horizon.cashFlow.scenarios.join(' · ')}`);
        lines.push('');
      }
      if (horizon.cashFlow.notes?.length) {
        for (const note of horizon.cashFlow.notes) lines.push(`> ${note}`);
        lines.push('');
      }
    }
    if (horizon.capital?.rows?.length) {
      lines.push('### Asignación de Capital');
      lines.push('');
      lines.push('| Concepto | Importe |');
      lines.push('|---|---|');
      for (const r of horizon.capital.rows) {
        lines.push(`| ${r.name} | ${r.value ?? '—'} |`);
      }
      lines.push('');
      if (horizon.capital.verification) {
        lines.push(`**Verificación:** ${horizon.capital.verification}`);
        lines.push('');
      }
      if (horizon.capital.notes?.length) {
        for (const note of horizon.capital.notes) lines.push(`> ${note}`);
        lines.push('');
      }
    }
  }

  if (report.conclusion && typeof report.conclusion === 'object') {
    lines.push('## Conclusiones');
    lines.push('');
    const c = report.conclusion;
    if (c.debt?.text) lines.push(`### Deuda\n${c.debt.text}\n`);
    if (c.outlook?.text) lines.push(`### Perspectivas de la Dirección\n${c.outlook.text}\n`);
    if (c.repurchases?.text) lines.push(`### Recompras de Acciones\n${c.repurchases.text}\n`);
    if (c.acquisitions?.text) lines.push(`### Adquisiciones\n${c.acquisitions.text}\n`);
    if (c.watchlist?.items?.length) {
      lines.push('### Lista de Seguimiento (Watchlist)');
      for (const item of c.watchlist.items) lines.push(`- ${String(item).replace(/^\d+:\s*/, '')}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(`*Análisis generado con IA por Cifra (${site}) a partir de la fuente primaria en SEC EDGAR. Fines informativos, no constituye recomendación de inversión.*`);
  return lines.join('\n');
}

export async function getPublicReportMarkdown(id) {
  const cleanId = Number(id);
  if (!Number.isInteger(cleanId) || cleanId <= 0) return null;
  let row = null;
  try {
    row = await loadPublicReportRow(cleanId);
  } catch {
    row = null;
  }
  if (!row) return null;
  return buildReportMarkdown(row);
}

export async function getPublicReportMarkdownBySlug(ticker, rawSlug) {
  const cleanTicker = String(ticker || '').trim().toUpperCase();
  const normSlug = String(rawSlug || '').trim().toUpperCase().replace(/10-K/, '10K');
  let row = null;
  try {
    row = await loadPublicReportBySlug(cleanTicker, normSlug);
  } catch {
    row = null;
  }
  if (!row) return null;

  const canonicalSlug = buildReportSlug(row);
  const markdown = buildReportMarkdown(row);
  return { markdown, canonicalSlug, ticker: String(row.ticker ?? cleanTicker).toUpperCase() };
}
