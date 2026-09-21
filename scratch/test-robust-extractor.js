import { getCompanyFilings, getFilingContentBuffer } from '../src/services/edgar.service.js';
import { extractTextFromPdf } from '../src/services/pdf.service.js';
import { htmlToText } from '../src/services/analysis/presentationExtractor.service.js';

function locateFinancialStatements(text) {
  const tablePatterns = [
    /(?:consolidated|condensed consolidated)\s+statements?\s+of\s+(?:operations|income|earnings)[\s\S]{0,250}?(?:\(in millions|\(in thousands|revenues|net sales|cost of)/i,
    /(?:consolidated|condensed consolidated)\s+balance\s+sheets?[\s\S]{0,250}?(?:\(in millions|\(in thousands|current assets|cash and cash equivalents)/i,
    /(?:consolidated|condensed consolidated)\s+statements?\s+of\s+cash\s+flows?[\s\S]{0,250}?(?:\(in millions|\(in thousands|operating activities|cash flows? from operating)/i,
  ];

  const matches = [];
  for (const pattern of tablePatterns) {
    const match = text.match(pattern);
    if (match && match.index != null) {
      matches.push({ index: match.index, length: match[0].length });
    }
  }

  if (matches.length === 0) {
    // Fallback: marcadores generales evitando patrones de índice
    const fallbackMarkers = [
      /(?:consolidated|condensed consolidated)\s+statements?\s+of\s+cash\s+flows?/gi,
      /(?:consolidated|condensed consolidated)\s+balance\s+sheets?/gi,
      /(?:consolidated|condensed consolidated)\s+statements?\s+of\s+(?:operations|income|earnings)/gi,
    ];
    for (const marker of fallbackMarkers) {
      let m;
      while ((m = marker.exec(text)) !== null) {
        const snippet = text.slice(m.index, m.index + 200);
        if (!/(?:\.{3,}|\t|\s{6,})\s*\d+\b/.test(snippet)) {
          matches.push({ index: m.index, length: m[0].length });
          break;
        }
      }
    }
  }

  if (matches.length === 0) return null;

  const minIndex = Math.min(...matches.map(m => m.index));
  const maxIndex = Math.max(...matches.map(m => m.index));

  const start = Math.max(0, minIndex - 2000);
  const end = Math.min(text.length, maxIndex + 25000);

  return { start, end };
}

async function test(ticker, formType) {
  const data = await getCompanyFilings(ticker);
  const f = data.filings.find(x => x.formType === formType);
  if (!f) return;
  const content = await getFilingContentBuffer(ticker, f.accession);
  const text = content.kind === 'pdf'
    ? await extractTextFromPdf(content.buffer)
    : htmlToText(content.buffer.toString('utf8'));

  const loc = locateFinancialStatements(text);
  const win = loc ? text.slice(loc.start, loc.end) : '';
  const hasCash = /cash flows? (?:from|provided by|used in) operating/i.test(win) || /operating activities/i.test(win);
  const hasBalance = /total assets/i.test(win);
  const hasIncome = /operating income|total revenues|net sales|gross profit/i.test(win);

  console.log(`\n${ticker} ${formType}: window [${loc?.start} - ${loc?.end}] len=${win.length}`);
  console.log(`  Income: ${hasIncome} | Balance: ${hasBalance} | CashFlow: ${hasCash}`);
}

async function main() {
  await test('KHC', '10-K');
  await test('KHC', '10-Q');
  await test('KO', '10-K');
  await test('KO', '10-Q');
  await test('PG', '10-K');
}

main().catch(console.error);
