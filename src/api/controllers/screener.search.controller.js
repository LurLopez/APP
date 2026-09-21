/**
 * @fileoverview Módulo extraído de screener.controller.js.
 */

import { searchCompanies } from '../../services/edgar.service.js';

export async function searchCompaniesHandler(req, res, next) {
  try {
    const query = String(req.query.q ?? '').trim();
    if (!query) {
      res.status(400).json({ error: 'Falta el parámetro de búsqueda "q".' });
      return;
    }
    const companies = await searchCompanies(query);
    res.json({ ok: true, companies });
  } catch (error) {
    next(error);
  }
}
