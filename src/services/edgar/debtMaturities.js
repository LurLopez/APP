/**
 * @fileoverview Extracción y estructuración del calendario contractual de vencimientos de deuda a partir de XBRL.
 * @module services/edgar/debtMaturities
 */

const DEBT_MATURITY_TAG_RE = /^(?:LongTermDebt|LongTermDebtAndCapitalLeaseObligations)MaturitiesRepaymentsOfPrincipal(InNextTwelveMonths|InRemainderOfFiscalYear|InYearTwo|InYearThree|InYearFour|InYearFive|AfterYearFive|InRollingYearTwo|InRollingYearThree|InRollingYearFour|InRollingYearFive|InRollingAfterYearFive)$/;

const DEBT_MATURITY_SLOT = {
  InNextTwelveMonths: { slot: 'nextTwelveMonths', offset: 1 },
  InRemainderOfFiscalYear: { slot: 'nextTwelveMonths', offset: 1 },
  InYearTwo: { slot: 'yearTwo', offset: 2 },
  InYearThree: { slot: 'yearThree', offset: 3 },
  InYearFour: { slot: 'yearFour', offset: 4 },
  InYearFive: { slot: 'yearFive', offset: 5 },
  AfterYearFive: { slot: 'afterYearFive', offset: null },
  InRollingYearTwo: { slot: 'yearTwo', offset: 2 },
  InRollingYearThree: { slot: 'yearThree', offset: 3 },
  InRollingYearFour: { slot: 'yearFour', offset: 4 },
  InRollingYearFive: { slot: 'yearFive', offset: 5 },
  InRollingAfterYearFive: { slot: 'afterYearFive', offset: null },
};

/**
 * Construye el desglose de vencimientos de deuda para los próximos 5 años y tramos posteriores.
 * @param {object} facts - Objeto de hechos XBRL (Company Facts).
 * @returns {object|null} Estructura de vencimientos o null si no está reportada.
 */
export function buildDebtMaturitiesFromFacts(facts) {
  const usGaap = facts?.facts?.['us-gaap'];
  if (!usGaap) return null;

  const byEnd = new Map();
  for (const [tag, meta] of Object.entries(usGaap)) {
    const match = tag.match(DEBT_MATURITY_TAG_RE);
    if (!match) continue;
    const slotInfo = DEBT_MATURITY_SLOT[match[1]];
    if (!slotInfo) continue;
    const unitData = meta?.units?.USD;
    if (!Array.isArray(unitData)) continue;

    for (const entry of unitData) {
      const val = Number(entry.val);
      if (!Number.isFinite(val) || val < 0 || !entry.end) continue;
      if (!byEnd.has(entry.end)) byEnd.set(entry.end, new Map());
      const bucket = byEnd.get(entry.end);
      const candidate = {
        val,
        filed: String(entry.filed ?? ''),
        isAnnual: String(entry.form ?? '').toUpperCase() === '10-K',
      };
      const prev = bucket.get(slotInfo.slot);
      if (!prev
        || (candidate.isAnnual && !prev.isAnnual)
        || (candidate.isAnnual === prev.isAnnual && candidate.filed > prev.filed)) {
        bucket.set(slotInfo.slot, candidate);
      }
    }
  }

  if (!byEnd.size) {
    const candidates = [];
    for (const tag of ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent']) {
      const unitData = usGaap?.[tag]?.units?.USD;
      if (!Array.isArray(unitData)) continue;
      for (const entry of unitData) {
        const val = Number(entry.val);
        if (!Number.isFinite(val) || val <= 0 || !entry.end) continue;
        candidates.push({
          val,
          end: entry.end,
          filed: String(entry.filed ?? ''),
          isAnnual: String(entry.form ?? '').toUpperCase() === '10-K',
        });
      }
    }
    const pool = candidates.filter((c) => c.isAnnual);
    const poolToUse = pool.length ? pool : candidates;
    if (!poolToUse.length) return null;
    poolToUse.sort((a, b) => {
      const end = b.end.localeCompare(a.end);
      if (end !== 0) return end;
      return b.filed.localeCompare(a.filed);
    });
    const fallback = poolToUse[0];
    const fallbackYear = Number(String(fallback.end).slice(0, 4));
    const fallbackAmount = Math.round((fallback.val / 1e6) * 10) / 10;
    return {
      baseYear: fallbackYear,
      asOf: fallback.end,
      years: [{ year: fallbackYear + 1, amount: fallbackAmount }],
      afterYearFive: null,
      totalAmount: fallbackAmount,
      partial: true,
      source: 'SEC XBRL (porción corriente de deuda a largo plazo)',
    };
  }

  const ends = [...byEnd.keys()].sort().reverse();
  const pickEnd = ends.find((end) => {
    const bucket = byEnd.get(end);
    return [...bucket.values()].some((e) => e.isAnnual);
  }) ?? ends[0];
  const bucket = byEnd.get(pickEnd);

  const toMillions = (entry) => (entry && Number.isFinite(entry.val) ? Math.round((entry.val / 1e6) * 10) / 10 : null);
  const baseYear = Number(String(pickEnd).slice(0, 4));

  const years = [];
  for (const [, info] of Object.entries(DEBT_MATURITY_SLOT)) {
    if (info.offset == null) continue;
    if (years.some((y) => y.offset === info.offset)) continue;
    const amount = toMillions(bucket.get(info.slot));
    if (amount != null) years.push({ offset: info.offset, amount });
  }
  years.sort((a, b) => a.offset - b.offset);

  if (!years.length) return null;

  const afterYearFive = toMillions(bucket.get('afterYearFive'));
  const totalAmount = years.reduce((sum, y) => sum + y.amount, 0) + (afterYearFive ?? 0);

  return {
    baseYear,
    asOf: pickEnd,
    years: years.map((y) => ({ year: baseYear + y.offset, amount: y.amount })),
    afterYearFive,
    totalAmount: Number.isFinite(totalAmount) ? Math.round(totalAmount * 10) / 10 : null,
    source: 'SEC XBRL (contractual maturities)',
  };
}
