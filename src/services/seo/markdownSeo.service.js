/**
 * @fileoverview Generadores de contenido Markdown estructurado para agentes IA, GEO y endpoints .md.
 * @module services/seo/markdownSeo.service
 */

import config from '../../../config/index.js';
import { filingPeriodLabel } from '../edgar.service.js';
import { titleCaseName, formatUsdMillions, formatUsdShare } from './seoConstants.js';
import { buildCompanyMeta } from './companyMeta.service.js';
import { getExecutiveChanges, getExecutiveFieldLabels } from '../reportExport/executiveChanges.js';
import { t, normalizeLanguage } from '../../utils/i18n.js';
import { getCompanySeoContent } from './botContent.service.js';
import {
  buildReportSlug,
  loadPublicReportRow,
  loadPublicReportBySlug,
} from './reportSeo.service.js';

export async function getCompanyMarkdown(ticker, lang = 'es') {
  const isEn = lang === 'en';
  const meta = await buildCompanyMeta(ticker, isEn ? 'en' : 'es');
  if (!meta) return null;
  const content = await getCompanySeoContent(meta.ticker);
  const site = config.siteUrl;
  const lines = [];

  const titleSuffix = isEn ? 'Financial Analysis and SEC Results' : 'Análisis Financiero y Resultados SEC';
  lines.push(`# ${meta.name} (${meta.ticker}) — ${titleSuffix}`);
  lines.push('');
  const sourceLabel = isEn
    ? `> Official primary source: SEC EDGAR (CIK: ${meta.cik ?? 'n/a'}). Listed on ${meta.exchange ?? 'US Stock Exchange'}.`
    : `> Fuente oficial primaria: SEC EDGAR (CIK: ${meta.cik ?? 'n/d'}). Cotiza en ${meta.exchange ?? 'Bolsa de EE. UU.'}.`;
  lines.push(sourceLabel);
  if (meta.sector) {
    const secLabel = isEn ? 'Sector' : 'Sector';
    const indLabel = isEn ? 'Industry' : 'Industria';
    lines.push(`> ${secLabel}: ${meta.sector}${meta.industry ? ` · ${indLabel}: ${meta.industry}` : ''}`);
  }
  lines.push(`> ${isEn ? 'Canonical URL' : 'URL Canónica'}: ${meta.url}`);
  lines.push('');
  lines.push(`## ${isEn ? 'Business Profile' : 'Perfil del Negocio'}`);
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
    lines.push(`## ${isEn ? 'Executive Financial Summary' : 'Resumen Financiero Ejecutivo'}`);
    lines.push('');
    if (isEn) {
      lines.push(`In its most recent fiscal year (${latest.year}), ${meta.name} reported sales of ${rev ?? '—'}${net ? `, net income of ${net}` : ''}${fcf ? ` and free cash flow (FCF) of ${fcf}` : ''}${fcfMargin !== null ? ` (${fcfMargin}% FCF margin)` : ''}${eps ? ` (diluted earnings per share of ${eps})` : ''}.`);
    } else {
      lines.push(`En su ejercicio fiscal más reciente (${latest.year}), ${meta.name} reportó ventas de ${rev ?? '—'}${net ? `, beneficio neto de ${net}` : ''}${fcf ? ` y un flujo de caja libre (FCF) de ${fcf}` : ''}${fcfMargin !== null ? ` (margen FCF del ${fcfMargin}%)` : ''}${eps ? ` (beneficio por acción diluido de ${eps})` : ''}.`);
    }
    lines.push('');
    lines.push(`## ${isEn ? 'Annual Financial Results (Recent Fiscal Years)' : 'Resultados Financieros Anuales (Últimos Ejercicios)'}`);
    lines.push('');
    if (isEn) {
      lines.push('| Fiscal Year | Revenue | Net Income | Free Cash Flow (FCF) | Diluted EPS |');
    } else {
      lines.push('| Ejercicio | Ventas (Revenue) | Beneficio Neto | Flujo de Caja Libre (FCF) | EPS Diluido |');
    }
    lines.push('|---|---|---|---|---|');
    for (const row of content.annual) {
      lines.push(`| ${row.year} | ${formatUsdMillions(row.revenue) ?? '—'} | ${formatUsdMillions(row.netIncome) ?? '—'} | ${formatUsdMillions(row.freeCashFlow) ?? '—'} | ${formatUsdShare(row.epsDiluted) ?? '—'} |`);
    }
    lines.push('');
  }

  if (content.filings.length) {
    lines.push(`## ${isEn ? '10-Q and 10-K Filings Submitted to the SEC' : 'Informes 10-Q y 10-K Presentados ante la SEC'}`);
    lines.push('');
    for (const f of content.filings) {
      const period = filingPeriodLabel(f.form, f.period);
      const url = f.documentUrl ?? `https://www.sec.gov/edgar/browse/?CIK=${meta.cik}`;
      const filedLabel = isEn ? `Filed on ${f.filedAt}` : `Presentado el ${f.filedAt}`;
      lines.push(`- [${f.form} (${period || f.filedAt})](${url}) — ${filedLabel}`);
    }
    lines.push('');
  }

  if (content.publicReports.length) {
    lines.push(`## ${isEn ? 'Reports Analyzed with AI on Cifra' : 'Informes Analizados con IA en Cifra'}`);
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
      const repPrefix = isEn ? `${site}/en/informe` : `${site}/informe`;
      const repUrl = `${repPrefix}/${encodeURIComponent(r.ticker)}/${slug}`;
      const reportTitle = isEn ? `Report ${formType} ${r.periodTitle ?? ''}` : `Informe ${formType} ${r.periodTitle ?? ''}`;
      lines.push(`- [${reportTitle}](${repUrl}) ([Markdown](${repUrl}.md))`);
    }
    lines.push('');
  }

  lines.push(`## ${isEn ? 'Frequently Asked Questions' : 'Preguntas Frecuentes'}`);
  lines.push('');
  if (isEn) {
    lines.push(`### What sector and industry does ${meta.name} operate in?`);
    lines.push(`${meta.name} (${meta.ticker}) is listed on ${meta.exchange ?? 'the US stock exchange'} and operates in the ${meta.industry ?? meta.sector ?? 'consumer defensive'} industry (consumer defensive sector in SEC EDGAR).`);
    lines.push('');
    lines.push(`### Where can I consult official filings for ${meta.ticker}?`);
    lines.push(`In the official SEC EDGAR system under CIK ${meta.cik} (https://www.sec.gov/edgar) or on Cifra's interactive company page (${meta.url}).`);
    lines.push('');
    lines.push('## Citation and Attribution');
    lines.push('');
    lines.push(`Data extracted from SEC EDGAR. Analysis structured by Cifra (${site}). For informational purposes only.`);
  } else {
    lines.push(`### ¿En qué sector e industria opera ${meta.name}?`);
    lines.push(`${meta.name} (${meta.ticker}) cotiza en ${meta.exchange ?? 'la bolsa de EE. UU.'} y opera en la industria de ${meta.industry ?? meta.sector ?? 'consumo defensivo'} (sector consumo defensivo en SEC EDGAR).`);
    lines.push('');
    lines.push(`### ¿Dónde consultar los filings oficiales de ${meta.ticker}?`);
    lines.push(`En el sistema oficial SEC EDGAR bajo el CIK ${meta.cik} (https://www.sec.gov/edgar) o en la ficha interactiva de Cifra (${meta.url}).`);
    lines.push('');
    lines.push('## Cita y Atribución');
    lines.push('');
    lines.push(`Datos extraídos de SEC EDGAR. Análisis estructurado por Cifra (${site}). Con fines exclusivamente informativos.`);
  }

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
  const lang = normalizeLanguage(report.language);
  lines.push(`# ${t('Informe {form} de {name} ({ticker}) — {period}', { form: formType, name, ticker, period: fyLabel }, lang)}`);
  lines.push('');
  lines.push(`> ${t('Empresa', null, lang)}: ${name} (${ticker})`);
  lines.push(`> ${t('Formulario', null, lang)}: ${formType} · ${t('Periodo', null, lang)}: ${fyLabel.trim()}`);
  lines.push(`> ${t('Fecha de publicación', null, lang)}: ${new Date(row.created_at).toISOString().slice(0, 10)}`);
  if (row.source_url) lines.push(`> ${t('Fuente oficial', null, lang)}: [SEC EDGAR Filing](${row.source_url})`);
  if (row.pdf_url) lines.push(`> ${t('Descargar PDF', null, lang)}: ${site}${row.pdf_url}`);
  lines.push(`> ${t('URL Canónica', null, lang)}: ${canonicalUrl}`);
  lines.push('');

  if (report.rating?.label) {
    lines.push(`**${t('Calificación Cifra', null, lang)}:** ${report.rating.label}${report.rating.rationale ? ` — ${report.rating.rationale}` : ''}`);
    lines.push('');
  }

  for (const horizon of report.horizons ?? []) {
    lines.push(`## ${horizon.label ?? t('Análisis', null, lang)}`);
    lines.push('');
    if (horizon.sales?.rows?.length) {
      lines.push(`### ${t('Ventas y Cuenta de Resultados', null, lang)}`);
      if (horizon.sales.eps) lines.push(`- **BPA / EPS:** ${horizon.sales.eps}`);
      if (horizon.sales.shares) lines.push(`- **${t('Acciones en circulación', null, lang)}:** ${horizon.sales.shares}`);
      lines.push('');
      lines.push(`| ${t('Concepto', null, lang)} | ${t('Actual', null, lang)} | ${t('Anterior', null, lang)} | ${t('Variación', null, lang)} |`);
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
      lines.push(`### ${t('Flujo de Caja', null, lang)}`);
      lines.push('');
      lines.push(`| ${t('Concepto', null, lang)} | ${t('Normal', null, lang)} | ${t('Ajustado', null, lang)} |`);
      lines.push('|---|---|---|');
      for (const r of horizon.cashFlow.rows) {
        lines.push(`| ${r.name} | ${r.values?.[0] ?? '—'} | ${r.values?.[1] ?? '—'} |`);
      }
      lines.push('');
      if (horizon.cashFlow.scenarios?.length) {
        lines.push(`**${t('Escenarios', null, lang)}:** ${horizon.cashFlow.scenarios.join(' · ')}`);
        lines.push('');
      }
      if (horizon.cashFlow.notes?.length) {
        for (const note of horizon.cashFlow.notes) lines.push(`> ${note}`);
        lines.push('');
      }
    }
    if (horizon.capital?.rows?.length) {
      lines.push(`### ${t('Asignación de Capital', null, lang)}`);
      lines.push('');
      lines.push(`| ${t('Concepto', null, lang)} | ${t('Importe', null, lang)} |`);
      lines.push('|---|---|');
      for (const r of horizon.capital.rows) {
        lines.push(`| ${r.name} | ${r.value ?? '—'} |`);
      }
      lines.push('');
      if (horizon.capital.verification) {
        lines.push(`**${t('Verificación', null, lang)}:** ${horizon.capital.verification}`);
        lines.push('');
      }
      if (horizon.capital.notes?.length) {
        for (const note of horizon.capital.notes) lines.push(`> ${note}`);
        lines.push('');
      }
    }
  }

  if (report.conclusion && typeof report.conclusion === 'object') {
    lines.push(`## ${t('Conclusiones', null, lang)}`);
    lines.push('');
    const c = report.conclusion;
    if (c.debt?.text) lines.push(`### ${t('Deuda', null, lang)}\n${c.debt.text}\n`);
    if (c.outlook?.text) lines.push(`### ${t('Perspectivas de la Dirección', null, lang)}\n${c.outlook.text}\n`);
    if (c.repurchases?.text) lines.push(`### ${t('Recompras de Acciones', null, lang)}\n${c.repurchases.text}\n`);
    const executiveChanges = getExecutiveChanges(c, lang);
    if (executiveChanges) {
      lines.push(`### ${executiveChanges.title || t('Cambios en la dirección', null, lang)}\n`);
      const personLine = (label, person) => {
        if (!person) return null;
        const fields = getExecutiveFieldLabels(lang)
          .map(([fieldLabel, key]) => [fieldLabel, person[key]])
          .filter(([, value]) => value);
        const heading = [person.name, person.role].filter(Boolean).join(' — ');
        if (!heading && !fields.length) return null;
        return `**${label}:** ${heading}`
          + fields.map(([fieldLabel, value]) => `\n  - **${fieldLabel}:** ${value}`).join('');
      };
      executiveChanges.changes.forEach((change) => {
        const role = change.role || t('Directivo', null, lang);
        if (change.text) lines.push(`${change.text}\n`);
        const meta = [
          change.announcementDate ? `${t('Anuncio', null, lang)}: ${change.announcementDate}` : null,
          change.effectiveDate ? `${t('Efectivo', null, lang)}: ${change.effectiveDate}` : null,
          change.reason ? `${t('Motivo', null, lang)}: ${change.reason}` : null,
        ].filter(Boolean);
        lines.push(meta.length ? `**${role}** — ${meta.join(' · ')}\n` : `**${role}**\n`);
        [personLine(t('Antiguo {role}', { role }, lang), change.oldExecutive), personLine(t('Nuevo {role}', { role }, lang), change.newExecutive)]
          .filter(Boolean)
          .forEach((line) => lines.push(`${line}\n`));
      });
      if (executiveChanges.disclaimer) lines.push(`*${executiveChanges.disclaimer}*\n`);
    }
    if (c.acquisitions?.text) {
      const corporateTitle = String(c.acquisitions.title || '').replace(/^\d+\s*:\s*/, '').trim()
        || t('Operaciones corporativas', null, lang);
      lines.push(`### ${corporateTitle}\n${c.acquisitions.text}\n`);
    }
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

export async function getPublicReportMarkdownBySlug(ticker, rawSlug, lang = 'es') {
  const cleanTicker = String(ticker || '').trim().toUpperCase();
  const normSlug = String(rawSlug || '').trim().toUpperCase().replace(/10-K/, '10K');
  let row = null;
  try {
    row = await loadPublicReportBySlug(cleanTicker, normSlug);
  } catch {
    row = null;
  }
  if (!row) return null;

  if (row.report && lang) {
    row.report = { ...row.report, language: lang };
  }

  const canonicalSlug = buildReportSlug(row);
  const markdown = buildReportMarkdown(row);
  return { markdown, canonicalSlug, ticker: String(row.ticker ?? cleanTicker).toUpperCase() };
}
