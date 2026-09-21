/**
 * @fileoverview Módulo extraído de analysis.controller.js.
 */

import { buildDownloadBase } from '../../services/analysis.service.js';
import { getAnalysisById } from '../../../db/repositories/analysisRepository.js';
import { resolveAnalysisVersion, isAnalysisOutdated } from '../../agents/sectorAgent.js';
import { resolveUser } from '../../middleware/auth.middleware.js';
import { parseIdParam, isAnalysisVisible } from '../../utils/validate.js';

export async function getAnalysisDetail(req, res, next) {
  try {
    const id = parseIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Identificador no válido.' });
      return;
    }

    const user = await resolveUser(req);
    const analysis = await getAnalysisById(id);

    if (!isAnalysisVisible(analysis, user)) {
      res.status(404).json({ error: 'El análisis solicitado no existe.' });
      return;
    }

    const { report } = analysis;
    const versionOptions = {
      sector: analysis.sector ?? 'defensive_consumer',
      subsector: analysis.subsector ?? null,
      ticker: analysis.ticker ?? report?.ticker ?? null,
      formType: report?.formType ?? null,
    };

    res.json({
      ok: true,
      analysis: {
        ...analysis,
        isReviewed: Boolean(analysis.is_reviewed),
        formType: report?.formType ?? null,
        ticker: analysis.ticker ?? report?.ticker ?? null,
        company_name: analysis.company_name ?? report?.company ?? null,
        periodTitle: report?.periodTitle ?? report?.period ?? null,
        downloadBase: buildDownloadBase(report, report?.formType ?? null),
        currentVersion: await resolveAnalysisVersion(versionOptions),
        versionOutdated: await isAnalysisOutdated({
          version: analysis.version,
          ...versionOptions,
        }),
      },
    });
  } catch (error) {
    next(error);
  }
}
