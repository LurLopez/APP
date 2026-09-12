import express from "express";
import { requireAdmin, resolveUser } from "../../middleware/auth.middleware.js";
import {
  listAnalysesForAdminReports,
  updateAnalysisErrorReport,
  deleteAnalysisErrorReport,
  deleteAnalysisById,
  deleteAnalysesByFiling,
  getAnalysisById,
} from "../../../db/repositories/analysisRepository.js";
import {
  createGeneralReport,
  listGeneralReports,
  getGeneralReportById,
  updateGeneralReport,
  deleteGeneralReport,
  getReportsStats,
} from "../../../db/repositories/generalReportsRepository.js";
import { cleanupGeneratedReports } from "../../services/report.service.js";
import { getFilingContentBuffer, getPresentationBuffers } from "../../services/edgar.service.js";
import { analyzePdf, analyzeText, htmlToText, buildPresentationText } from "../../services/analysis.service.js";
import { AgentError } from "../../agents/baseAgent.js";
import { invalidateReportCache } from "../../services/seo.service.js";

const router = express.Router();

/* ── Métricas y resumen global ── */
router.get("/admin/reports/stats", requireAdmin, async (_req, res, next) => {
  try {
    const stats = await getReportsStats();
    res.json({ ok: true, stats });
  } catch (error) {
    next(error);
  }
});

/* ── Parte 1: Reportes por Análisis de IA (ordenados por empresa y resultados) ── */
router.get("/admin/reports/ai", requireAdmin, async (req, res, next) => {
  try {
    const ticker = String(req.query.ticker ?? "").trim() || null;
    const items = await listAnalysesForAdminReports({ ticker });

    // Agrupar ordenadamente por empresa y dentro de cada una por sus resultados
    const companyMap = new Map();
    for (const item of items) {
      const compKey = String(item.ticker || "OTRO").toUpperCase();
      if (!companyMap.has(compKey)) {
        companyMap.set(compKey, {
          ticker: item.ticker || (compKey === "OTRO" ? "DEMO" : compKey),
          companyName: item.company_name || item.ticker || (compKey === "OTRO" ? "Informes de Demostración" : compKey),
          totalAnalyses: 0,
          totalErrors: 0,
          results: [],
        });
      }
      const comp = companyMap.get(compKey);
      comp.totalAnalyses += 1;
      comp.totalErrors += Number(item.error_reports_count || 0);
      comp.results.push(item);
    }

    const companies = Array.from(companyMap.values()).sort((a, b) => {
      // Priorizar empresas con incidencias de error reportadas
      if (b.totalErrors !== a.totalErrors) return b.totalErrors - a.totalErrors;
      return String(a.ticker || "").localeCompare(String(b.ticker || ""));
    });

    res.json({
      ok: true,
      totalAnalyses: items.length,
      totalCompanies: companies.length,
      companies,
      rawList: items,
    });
  } catch (error) {
    next(error);
  }
});

/* Actualizar incidencia de error de análisis de IA */
router.patch("/admin/reports/ai/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Identificador no válido." });
      return;
    }
    const { status, adminNotes } = req.body;
    const updated = await updateAnalysisErrorReport(id, { status, adminNotes });
    if (!updated) {
      res.status(404).json({ error: "Reporte de incidencia no encontrado." });
      return;
    }
    res.json({ ok: true, report: updated, message: "Incidencia actualizada con éxito." });
  } catch (error) {
    next(error);
  }
});

/* Eliminar incidencia de error de análisis de IA */
router.delete("/admin/reports/ai/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Identificador no válido." });
      return;
    }
    const deleted = await deleteAnalysisErrorReport(id);
    if (!deleted) {
      res.status(404).json({ error: "Reporte de incidencia no encontrado." });
      return;
    }
    res.json({ ok: true, message: "Incidencia eliminada con éxito." });
  } catch (error) {
    next(error);
  }
});

/* Eliminar informe de análisis por ID */
router.delete("/admin/reports/ai-analysis/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Identificador no válido." });
      return;
    }
    const analysis = await getAnalysisById(id);
    if (!analysis) {
      res.status(404).json({ error: "El análisis no existe." });
      return;
    }
    await deleteAnalysisById(id);
    if (analysis.pdf_url) {
      await cleanupGeneratedReports(analysis.pdf_url);
    }
    res.json({ ok: true, message: "Informe de análisis eliminado con éxito." });
  } catch (error) {
    next(error);
  }
});

/* Regenerar informe de análisis por ID */
router.post("/admin/reports/ai-analysis/:id/regenerate", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Identificador no válido." });
      return;
    }
    const existing = await getAnalysisById(id);
    if (!existing) {
      res.status(404).json({ error: "El análisis no existe." });
      return;
    }

    const ticker = existing.ticker;
    const accession = existing.accession;

    if (!ticker || !accession) {
      res.status(400).json({ error: "El análisis no cuenta con ticker o accession para consultar SEC EDGAR." });
      return;
    }

    // 1. Eliminar informe previo y archivos
    const deleted = await deleteAnalysesByFiling({ ticker, accession });
    for (const item of deleted) {
      if (item.pdf_url) {
        await cleanupGeneratedReports(item.pdf_url);
      }
    }

    // 2. Volver a generar desde SEC EDGAR
    const content = await getFilingContentBuffer(ticker, accession);
    if (!content) {
      res.status(404).json({ error: "Informe no encontrado en SEC EDGAR.", code: "FILING_NOT_FOUND" });
      return;
    }

    // Documento complementario: presentación de resultados (8-K) con outlook / guidance
    let presentationText = null;
    try {
      const presentations = await getPresentationBuffers(ticker, accession);
      if (presentations.length) {
        presentationText = await buildPresentationText(presentations);
      }
    } catch (presentationError) {
      console.warn("[analysis:presentation]", presentationError.message);
    }

    const options = {
      userId: existing.is_public ? null : req.user.id,
      actor: req.user.username || req.user.email,
      isPublic: existing.is_public === true,
      filename: `${ticker}-${accession}.pdf`,
      ticker,
      accession,
      sourceUrl: content.filing?.documentUrl ?? null,
      formType: content.filing?.formType ?? null,
      presentationText,
    };

    const result = content.kind === "pdf"
      ? await analyzePdf(content.buffer, options)
      : await analyzeText(htmlToText(content.buffer.toString("utf8")), options);

    invalidateReportCache(id);

    res.json({
      ok: true,
      analysisId: result.analysisId ?? null,
      origin: result.origin,
      formType: result.formType,
      sector: result.sector,
      report: result.report,
      pdfUrl: result.pdfUrl,
      downloadBase: result.downloadBase,
      regenerated: true,
      message: "Informe generado de nuevo con éxito.",
    });
  } catch (error) {
    if (error instanceof AgentError) {
      res.status(422).json({ error: error.message, code: error.code });
      return;
    }
    next(error);
  }
});

/* ── Parte 2: Reportes Generales ── */
router.get("/admin/reports/general", requireAdmin, async (req, res, next) => {
  try {
    const { status, category, search } = req.query;
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 200);
    const reports = await listGeneralReports({
      status: String(status ?? "").trim() || null,
      category: String(category ?? "").trim() || null,
      search: String(search ?? "").trim() || null,
      limit,
    });
    res.json({ ok: true, reports });
  } catch (error) {
    next(error);
  }
});

/* Actualizar reporte general */
router.patch("/admin/reports/general/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Identificador no válido." });
      return;
    }
    const { status, adminNotes } = req.body;
    const updated = await updateGeneralReport(id, { status, adminNotes });
    if (!updated) {
      res.status(404).json({ error: "Reporte general no encontrado." });
      return;
    }
    res.json({ ok: true, report: updated, message: "Reporte general actualizado." });
  } catch (error) {
    next(error);
  }
});

/* Eliminar reporte general */
router.delete("/admin/reports/general/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Identificador no válido." });
      return;
    }
    const deleted = await deleteGeneralReport(id);
    if (!deleted) {
      res.status(404).json({ error: "Reporte general no encontrado." });
      return;
    }
    res.json({ ok: true, message: "Reporte general eliminado." });
  } catch (error) {
    next(error);
  }
});

/* Crear reporte general (abierto a cualquier usuario o administrador) */
router.post("/reports/general", async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    const title = String(req.body.title || "").trim().slice(0, 255);
    const description = String(req.body.description || "").trim().slice(0, 4000);
    const category = String(req.body.category || "general").trim();
    const userEmail = String(req.body.userEmail || user?.email || "").trim().slice(0, 255) || null;

    if (!title || !description) {
      res.status(400).json({ error: "Por favor, introduce un título y una descripción detallada del problema." });
      return;
    }

    const report = await createGeneralReport({
      userId: user?.id ?? null,
      userEmail,
      category,
      title,
      description,
    });

    res.status(201).json({
      ok: true,
      report,
      message: "Reporte enviado correctamente. El equipo de administración lo revisará pronto.",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
