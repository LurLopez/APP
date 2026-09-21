import { getCompanyFilings, getFilingContentBuffer } from '../src/services/edgar.service.js';
import { extractTextFromPdf } from '../src/services/pdf.service.js';
import { htmlToText } from '../src/services/analysis/presentationExtractor.service.js';

async function testFiling(ticker, formType) {
  const data = await getCompanyFilings(ticker);
  const f = data.filings.find(x => x.formType === formType);
  if (!f) {
    console.log(`No ${formType} found for ${ticker}`);
    return;
  }
  console.log(`\n=== Testing ${ticker} ${formType} (${f.accession}) ===`);
  const content = await getFilingContentBuffer(ticker, f.accession);
  const text = content.kind === 'pdf'
    ? await extractTextFromPdf(content.buffer)
    : htmlToText(content.buffer.toString('utf8'));

  console.log('Total length:', text.length);

  const realIncome = /(?:consolidated|condensed consolidated)\s+statements?\s+of\s+(?:operations|income|earnings)[\s\S]{0,250}?(?:\(in millions|\(in thousands|revenues|net sales|cost of)/i;
  const realBalance = /(?:consolidated|condensed consolidated)\s+balance\s+sheets?[\s\S]{0,250}?(?:\(in millions|\(in thousands|current assets|cash and cash equivalents)/i;
  const realCash = /(?:consolidated|condensed consolidated)\s+statements?\s+of\s+cash\s+flows?[\s\S]{0,250}?(?:\(in millions|\(in thousands|operating activities|cash flows? from operating)/i;

  const mIncome = text.match(realIncome);
  const mBalance = text.match(realBalance);
  const mCash = text.match(realCash);

  console.log('Income real pos:', mIncome?.index, mIncome ? text.slice(mIncome.index, mIncome.index + 60).replace(/\n/g, ' ') : 'NO MATCH');
  console.log('Balance real pos:', mBalance?.index, mBalance ? text.slice(mBalance.index, mBalance.index + 60).replace(/\n/g, ' ') : 'NO MATCH');
  console.log('Cash real pos:', mCash?.index, mCash ? text.slice(mCash.index, mCash.index + 60).replace(/\n/g, ' ') : 'NO MATCH');
}

async function run() {
  await testFiling('KHC', '10-K');
  await testFiling('KHC', '10-Q');
  await testFiling('KO', '10-K');
  await testFiling('KO', '10-Q');
}

run().catch(console.error);
