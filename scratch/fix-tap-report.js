import { pool } from '../db/pool.js';
import { generateReportPdf } from '../src/services/report.service.js';
import { getPublicReportMarkdown } from '../src/services/seo.service.js';
import { writeFileSync } from 'node:fs';

async function fixTapReports() {
  const { rows } = await pool.query(
    `SELECT id, ticker, report, period_end FROM analyses WHERE ticker = 'TAP' AND period_end = '2025-12-31' ORDER BY id DESC`
  );

  console.log(`Found ${rows.length} analyses for TAP 2025-12-31`);

  for (const row of rows) {
    const report = row.report;
    if (!report || !report.horizons) continue;

    for (const horizon of report.horizons) {
      // 1. Corregir Ventas
      if (horizon.sales) {
        // Asegurar que Beneficio Neto apunte a *2
        const netoRow = horizon.sales.rows?.find((r) => String(r.name).toLowerCase().includes('neto'));
        if (netoRow) {
          netoRow.isAdjusted = true;
          netoRow.adjustedNote = '*2';
        }

        // Unificar notas de impuestos a una sola *2 bien desarrollada
        if (Array.isArray(horizon.sales.notes)) {
          const notes = [];
          const note1 = horizon.sales.notes.find((n) => n.startsWith('*1') || n.includes('deterioro') || n.includes('impairment'));
          if (note1) {
            notes.push(note1);
          } else {
            notes.push(horizon.sales.notes[0]);
          }

          const taxNote = `*2: El año ha registrado un beneficio fiscal reportado de 337,8M (tipo efectivo distorsionado por los deterioros extraordinarios). Se normalizan los impuestos al 23 % sobre el EBT ajustado: 1385,4M × 0,23 = 318,6M de gasto fiscal teórico, frente al beneficio fiscal reportado de 337,8M. Beneficio Neto Ajustado = 1385,4M × 0,77 = 1066,8M. Esta normalización fiscal es clave para ajustar el Cash Flow.`;
          notes.push(taxNote);

          horizon.sales.notes = notes;
        }
      }

      // 2. Corregir Cash Flow
      if (horizon.cashFlow && Array.isArray(horizon.cashFlow.rows)) {
        const cfoRow = horizon.cashFlow.rows.find((r) => String(r.name).toLowerCase().includes('cash flow') || String(r.name).toLowerCase().includes('flujo de caja'));
        const capexRow = horizon.cashFlow.rows.find((r) => String(r.name).toLowerCase().includes('capex'));
        const fcfRow = horizon.cashFlow.rows.find((r) => String(r.name).trim().toLowerCase() === 'fcf');
        const fcfPerShareRow = horizon.cashFlow.rows.find((r) => String(r.name).toLowerCase().includes('fcf/acción') || String(r.name).toLowerCase().includes('fcf / acción'));
        const dividendRow = horizon.cashFlow.rows.find((r) => String(r.name).toLowerCase().includes('dividendo'));
        const libreRow = horizon.cashFlow.rows.find((r) => String(r.name).toLowerCase().includes('libre'));

        // Normal: 1784,4; Ajustado: 1756,0 (1943,2 - 187,2)
        if (cfoRow) {
          cfoRow.values = ['1784,4', '1756,0'];
          cfoRow.cashFlowAdjustedNote = '*2';
        }
        if (capexRow) {
          capexRow.values = ['716,6', '716,6'];
        }
        if (fcfRow) {
          fcfRow.values = ['1067,8', '1039,4'];
        }
        if (fcfPerShareRow) {
          fcfPerShareRow.values = ['5,47 $', '5,33 $'];
        }
        if (dividendRow) {
          dividendRow.values = ['376,3', '376,3'];
        }
        if (libreRow) {
          libreRow.values = ['691,5', '663,1'];
        }

        // Notas de Cash Flow: *1 para WK, *2 para Impuestos
        const wcNote = horizon.cashFlow.notes?.find((n) => n.includes('WK') || n.includes('circulante'))
          || '*1: WK = (Cuentas por pagar - Inventarios - Cuentas por cobrar) × (inflación + volumen) = (1823 - 716 - 703) × (3% + 0%) = 12,1M en todo el año. Desviación del circulante reportado (-146,7M) frente al WK teórico (12,1M): -158,8M. El Cash Flow ajustado resta esa desviación: 1784,4M - (-158,8M) = 1943,2M.';

        const cfTaxNote = `*2: Impuestos: La empresa debería haber pagado 318,6M en impuestos (23 % sobre el EBT ajustado de 1385,4M) y solamente ha pagado 131,4M en efectivo según el estado de flujos. Ajuste de -187,2M al Cash Flow Ajustado por la discrepancia fiscal.`;

        horizon.cashFlow.notes = [wcNote, cfTaxNote];
      }
    }

    // Regenerar PDF para el informe más reciente (id 505)
    let pdfUrl = null;
    if (row.id === 505) {
      try {
        const pdfRes = await generateReportPdf(report);
        pdfUrl = pdfRes.url;
        console.log(`PDF regenerated for analysis ${row.id}: ${pdfUrl}`);
      } catch (err) {
        console.error(`Error regenerating PDF for ${row.id}:`, err.message);
      }
    }

    if (pdfUrl) {
      await pool.query(
        `UPDATE analyses SET report = $1, pdf_url = $2 WHERE id = $3`,
        [JSON.stringify(report), pdfUrl, row.id]
      );
    } else {
      await pool.query(
        `UPDATE analyses SET report = $1 WHERE id = $2`,
        [JSON.stringify(report), row.id]
      );
    }
    console.log(`Updated analysis #${row.id}`);
  }

  // Exportar nueva versión a comparacion/TAP-2025-10K_nueva_opencode.md
  const md = await getPublicReportMarkdown(505);
  if (md) {
    writeFileSync('comparacion/TAP-2025-10K_nueva_opencode.md', md);
    console.log('Updated comparacion/TAP-2025-10K_nueva_opencode.md');
  }

  console.log('All TAP 2025 reports fixed!');
  process.exit(0);
}

fixTapReports().catch((err) => {
  console.error(err);
  process.exit(1);
});
