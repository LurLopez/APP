import { getFilingContentBuffer, getPresentationBuffers } from '../src/services/edgar.service.js';
import { analyzePdf, analyzeText, htmlToText, buildPresentationText } from '../src/services/analysis.service.js';
import { generateReportPdf } from '../src/services/report.service.js';
import fs from 'node:fs/promises';

async function main() {
  const ticker = 'KHC';
  const accession = '0001637459-24-000018';
  console.log(`Iniciando análisis de prueba para ${ticker} (${accession})...`);
  console.log(`AI_PROVIDER=${process.env.AI_PROVIDER || 'deepseek'}, AI_THINKING=${process.env.AI_THINKING || 'disabled'}`);

  const content = await getFilingContentBuffer(ticker, accession);
  if (!content) {
    throw new Error('No se pudo descargar el filing de EDGAR');
  }

  let presentationText = null;
  try {
    const presentations = await getPresentationBuffers(ticker, accession);
    if (presentations.length) {
      presentationText = await buildPresentationText(presentations);
      console.log(`Presentación complementaria cargada: ${presentationText.length} caracteres`);
    }
  } catch (err) {
    console.warn('Error al obtener presentación:', err.message);
  }

  const options = {
    userId: 1,
    actor: 'admin',
    isPublic: true,
    filename: `${ticker}-${accession}.pdf`,
    ticker,
    accession,
    sourceUrl: content.filing?.documentUrl ?? null,
    formType: '10-K',
    presentationText,
  };

  const startTime = Date.now();
  const result = content.kind === 'pdf'
    ? await analyzePdf(content.buffer, options)
    : await analyzeText(htmlToText(content.buffer.toString('utf8')), options);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nAnálisis completado en ${durationSec} s!`);
  console.log(`ID generado: ${result.analysisId}`);

  const report = result.report;
  console.log('\n--- RESUMEN HORIZONTE (12 MESES) ---');
  const h = report.horizons?.[0];
  if (h) {
    console.log('Ventas / EPS:');
    console.log(' - EPS:', h.sales?.eps);
    console.log(' - Shares:', h.sales?.shares);
    console.log(' - Filas:');
    h.sales?.rows?.forEach(r => console.log(`   * ${r.name}: normal=${r.normal}, adj=${r.adjusted}, %norm=${r.pctNormal}, %adj=${r.pctAdjusted}`));

    console.log('\nCash Flow:');
    h.cashFlow?.rows?.forEach(r => console.log(`   * ${r.name}: values=${JSON.stringify(r.values)}`));
    console.log(' - Notas CF:', h.cashFlow?.notes);

    console.log('\nAsignación de Capital:');
    h.capital?.rows?.forEach(r => console.log(`   * ${r.name}: value=${r.value}`));
    console.log(' - Nota Capital:', h.capital?.note);
  }

  console.log('\n--- CONCLUSIÓN ---');
  console.log('Recompras:', report.conclusion?.repurchases?.title);
  console.log('Outlook:', report.conclusion?.outlook?.title);
  console.log('Deuda:', report.conclusion?.debt?.title);
  console.log('Rating:', report.rating);

  // Generar PDF y sobrescribir /home/lur/Documentos/KHC-2023-K.pdf para que el usuario tenga el PDF corregido
  const pdfBuffer = await generateReportPdf(report, '10-K');
  await fs.writeFile('/home/lur/Documentos/KHC-2023-K.pdf', pdfBuffer);
  console.log('\n-> PDF guardado exitosamente en /home/lur/Documentos/KHC-2023-K.pdf');

  process.exit(0);
}

main().catch(err => {
  console.error('Error en el análisis:', err);
  process.exit(1);
});
