import { query } from '../pool.js';

export { createAnalysis, getAnalysisById, listAnalyses, updateAnalysis, findLatestDoneAnalysis, findDoneAnalysisByFilename, findUserAnalysis, setAnalysisReviewed, listAnalysisCompanies } from './analysisRepositoryCore.js';
export { getAnalysisVersions, getAnalyzedAccessionsWithRatings, getAnalyzedAccessions, saveAnalysisRating, getAnalysisRatingSummary, createAnalysisErrorReport, deleteAnalysisById, deleteAnalysesByFiling, listAnalysesForAdminReports } from './analysisRepositoryQueries.js';
export { updateAnalysisErrorReport, deleteAnalysisErrorReport, batchUpdateAnalysisErrorReports, batchDeleteAnalysisErrorReports } from './analysisRepositoryReports.js';

// Todas las versiones guardadas de un mismo informe (públicas o del propio
// usuario), de la más reciente a la más antigua. Nunca se eliminan al regenerar.

