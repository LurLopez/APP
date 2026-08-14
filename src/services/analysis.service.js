import { extractTextFromPdf } from './pdf.service.js';
import { getAgent } from '../agents/agentRegistry.js';
import { generateReportPdf } from './report.service.js';

export async function analyzePdf(buffer) {
  const text = await extractTextFromPdf(buffer);

  const originAgent = getAgent('origin');
  const originResult = await originAgent.run({ text });

  const sectorAgent = getAgent('sector');
  const sectorResult = await sectorAgent.run({ text });

  const analystAgent = getAgent('analyst');
  const report = await analystAgent.run({ text, sector: sectorResult.sector });

  const { url } = await generateReportPdf(report);

  return {
    text,
    origin: originResult.origin,
    formType: originResult.formType,
    sector: sectorResult.sector,
    report,
    pdfUrl: url,
  };
}
