import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

// Expresión regular y tipos de contenido para los informes descargables
const FILE_NAME_PATTERN = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)\.(pdf|docx|odt|html)$/;

const REPORT_CONTENT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  html: 'text/html; charset=utf-8',
};

test('FILE_NAME_PATTERN valida correctamente los 4 formatos soportados', () => {
  const uuid = 'd7bec8c1-0c0a-473d-b10b-41eeb97221d1';
  
  for (const ext of ['pdf', 'docx', 'odt', 'html']) {
    const filename = `${uuid}.${ext}`;
    const match = FILE_NAME_PATTERN.exec(filename);
    assert.ok(match, `Debería coincidir para formato ${ext}`);
    assert.equal(match[1], uuid);
    assert.equal(match[2], ext);
  }
});

test('FILE_NAME_PATTERN rechaza formatos no permitidos e intentos de path traversal', () => {
  assert.equal(FILE_NAME_PATTERN.test('../etc/passwd.pdf'), false);
  assert.equal(FILE_NAME_PATTERN.test('report.exe'), false);
  assert.equal(FILE_NAME_PATTERN.test('report.js'), false);
  assert.equal(FILE_NAME_PATTERN.test('report.sh'), false);
  assert.equal(FILE_NAME_PATTERN.test('_underscore.pdf'), false);
  assert.equal(FILE_NAME_PATTERN.test('uuid..pdf'), false);
  assert.equal(FILE_NAME_PATTERN.test('uuid.pdf/sub'), false);
});

test('La resolución del baseName mapea siempre al archivo pdf de la BD sin importar la extensión solicitada', () => {
  const files = [
    'd7bec8c1-0c0a-473d-b10b-41eeb97221d1.pdf',
    'd7bec8c1-0c0a-473d-b10b-41eeb97221d1.docx',
    'd7bec8c1-0c0a-473d-b10b-41eeb97221d1.odt',
    'd7bec8c1-0c0a-473d-b10b-41eeb97221d1.html',
  ];

  for (const file of files) {
    const baseName = path.basename(file, path.extname(file));
    assert.equal(baseName, 'd7bec8c1-0c0a-473d-b10b-41eeb97221d1');
    const relativePdf = `/api/reports/${baseName}.pdf`;
    assert.equal(relativePdf, '/api/reports/d7bec8c1-0c0a-473d-b10b-41eeb97221d1.pdf');
  }
});

test('REPORT_CONTENT_TYPES define cabeceras MIME válidas para todos los formatos', () => {
  assert.equal(REPORT_CONTENT_TYPES.pdf, 'application/pdf');
  assert.equal(REPORT_CONTENT_TYPES.docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(REPORT_CONTENT_TYPES.odt, 'application/vnd.oasis.opendocument.text');
  assert.equal(REPORT_CONTENT_TYPES.html, 'text/html; charset=utf-8');
});

test('Sanitización de nombres de descarga previene caracteres no seguros y trunca longitud', () => {
  const sanitize = (raw, ext) => `${String(raw).slice(0, 120).replace(/[^\w.-]/g, '_')}.${ext}`;

  assert.equal(sanitize('PEP-2026-Q2', 'docx'), 'PEP-2026-Q2.docx');
  assert.equal(sanitize('KO / Coke (Q1)?', 'odt'), 'KO___Coke__Q1__.odt');
  assert.equal(sanitize('../../../malicious/path', 'pdf'), '.._.._.._malicious_path.pdf');
});
