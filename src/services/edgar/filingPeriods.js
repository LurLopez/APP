/**
 * @fileoverview Normalización y extracción de periodos fiscales y presentaciones 10-K / 10-Q de la SEC.
 * @module services/edgar/filingPeriods
 */

import { FILINGS_LIMIT } from './statementConcepts.js';
import { getCompanyByTicker, getCompanySubmissions } from './companyProfile.js';

/**
 * Determina el trimestre fiscal (Q1, Q2, Q3, FY), año fiscal y etiqueta amigable de un informe.
 * @param {string} formType - Tipo de formulario (10-K, 10-Q).
 * @param {string} reportDate - Fecha del reporte (YYYY-MM-DD).
 * @param {string|null} [fiscalYearEnd=null] - Cierre fiscal en formato MMDD (ej. '1231', '0930').
 * @returns {{quarter: string|null, fiscalYear: number|null, label: string}} Información del periodo fiscal.
 */
export function getFiscalPeriodInfo(formType, reportDate, fiscalYearEnd = null) {
  if (!reportDate) {
    return { quarter: null, fiscalYear: null, label: '—' };
  }
  const is10K = Boolean(formType && formType.startsWith('10-K'));
  const d = new Date(`${reportDate}T00:00:00Z`);
  const year = Number.isNaN(d.getTime()) ? Number(reportDate.slice(0, 4)) : d.getUTCFullYear();
  if (is10K) {
    return { quarter: 'FY', fiscalYear: year, label: `FY ${year}` };
  }

  const month = Number.isNaN(d.getTime()) ? Number(reportDate.slice(5, 7)) : d.getUTCMonth() + 1;
  const day = Number.isNaN(d.getTime()) ? Number(reportDate.slice(8, 10)) : d.getUTCDate();

  let fyeMonth = 12;
  let fyeDay = 31;
  if (typeof fiscalYearEnd === 'string' && fiscalYearEnd.length >= 4) {
    const parsedM = parseInt(fiscalYearEnd.slice(0, 2), 10);
    const parsedD = parseInt(fiscalYearEnd.slice(2, 4), 10);
    if (!Number.isNaN(parsedM) && parsedM >= 1 && parsedM <= 12) fyeMonth = parsedM;
    if (!Number.isNaN(parsedD) && parsedD >= 1 && parsedD <= 31) fyeDay = parsedD;
  }

  let fy = year;
  const reportMD = month * 100 + day;
  const fyeMD = fyeMonth * 100 + Math.min(31, fyeDay + 7);
  if (reportMD > fyeMD) {
    fy = year + 1;
  }

  const fyeDate = new Date(Date.UTC(fy, fyeMonth - 1, fyeDay));
  const diffDays = Math.round((fyeDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  let q = 1;
  if (diffDays <= 135) {
    q = 3;
  } else if (diffDays <= 227) {
    q = 2;
  } else {
    q = 1;
  }
  return { quarter: `Q${q}`, fiscalYear: fy, label: `Q${q} ${fy}` };
}

/**
 * Suma o resta días a una fecha ISO (YYYY-MM-DD) preservando UTC.
 * @param {string} dateStr - Fecha en formato YYYY-MM-DD.
 * @param {number} days - Número de días a sumar o restar.
 * @returns {string|null} Fecha resultante en formato YYYY-MM-DD o null si inválida.
 */
export function addDaysToDate(dateStr, days) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Genera la etiqueta del periodo para un informe (ej. "FY 2024", "Q3 2025").
 * @param {string} formType - Formulario (10-K o 10-Q).
 * @param {string} reportDate - Fecha del periodo.
 * @param {string|null} [fiscalYearEnd=null] - Cierre fiscal MMDD.
 * @returns {string} Etiqueta representativa.
 */
export function filingPeriodLabel(formType, reportDate, fiscalYearEnd = null) {
  return getFiscalPeriodInfo(formType, reportDate, fiscalYearEnd).label;
}

/**
 * Normaliza el objeto o arreglo de presentaciones recientes recibido de la API de la SEC.
 * @param {object|Array} recent - Submissions recientes de la SEC.
 * @returns {Array<object>} Lista ordenada de presentaciones individuales.
 */
export function normalizeRecentFilings(recent) {
  if (Array.isArray(recent)) return recent;
  const fields = Object.keys(recent ?? {});
  if (!fields.length) return [];
  const length = fields.reduce((max, field) => Math.max(max, recent[field]?.length ?? 0), 0);
  const entries = [];
  for (let i = 0; i < length; i += 1) {
    const entry = {};
    for (const field of fields) entry[field] = recent[field][i];
    entries.push(entry);
  }
  return entries;
}

/**
 * Obtiene las presentaciones periódicas recientes (10-K y 10-Q) de una empresa.
 * @param {string} ticker - Ticker del activo.
 * @param {object} [options={}] - Opciones de filtrado y límite.
 * @returns {Promise<{company: object, filings: Array<object>}>} Empresa y lista de filings.
 */
export async function getCompanyFilings(ticker, options = {}) {
  const limit = Number(options?.limit) || FILINGS_LIMIT;
  const company = await getCompanyByTicker(ticker);
  const submissions = await getCompanySubmissions(company);
  const recent = normalizeRecentFilings(submissions?.filings?.recent);
  const fiscalYearEnd = submissions?.fiscalYearEnd ?? null;
  const filings = recent
    .filter((entry) => entry.form === '10-Q' || entry.form === '10-K')
    .filter((entry) => entry.accessionNumber && entry.primaryDocument)
    .slice(0, limit)
    .map((entry) => {
      const accessionNoDashes = entry.accessionNumber.replaceAll('-', '');
      const filedAt = entry.filingDate ?? null;
      const formShort = entry.form.slice(3).toLowerCase();
      const primaryDocument = entry.primaryDocument ?? '';
      const isPdf = primaryDocument.toLowerCase().endsWith('.pdf');
      const periodInfo = getFiscalPeriodInfo(entry.form, entry.reportDate, fiscalYearEnd);
      return {
        formType: entry.form,
        period: entry.reportDate ?? null,
        periodLabel: periodInfo.label,
        quarter: periodInfo.quarter,
        fiscalYear: periodInfo.fiscalYear,
        filedAt,
        accession: entry.accessionNumber,
        documentUrl: `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accessionNoDashes}/${primaryDocument}`,
        documentName: `${company.ticker.toLowerCase()}-${formShort}-${filedAt ? filedAt.slice(0, 4) : accessionNoDashes.slice(0, 4)}.${isPdf ? 'pdf' : 'htm'}`,
      };
    });
  return {
    company: { ticker: company.ticker, name: company.name, cik: company.cik },
    filings,
  };
}
