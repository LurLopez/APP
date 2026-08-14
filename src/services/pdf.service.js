import { PDFParse } from 'pdf-parse';

export async function extractTextFromPdf(buffer) {
  const pdf = new PDFParse({ data: buffer });
  try {
    const result = await pdf.getText();
    return result.text ?? '';
  } finally {
    await pdf.destroy();
  }
}
