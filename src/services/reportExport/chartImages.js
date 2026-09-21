/**
 * @fileoverview Rasterización de gráficos SVG a PNG para inclusión en formatos DOCX y ODT.
 * @module services/reportExport/chartImages
 */

import { Resvg } from '@resvg/resvg-js';
import {
  renderSharesChartSvg,
  renderDebtMaturitySvg,
  renderDebtHistorySvg,
  renderDividendSvg,
} from './svgRenderers.js';

export const CHART_RASTER_WIDTH = 1920;

/**
 * Convierte un gráfico SVG a buffer PNG de alta resolución.
 * @param {string} svg - Cadena XML con el SVG del gráfico.
 * @param {number} [width=1920] - Ancho del gráfico rasterizado en píxeles.
 * @returns {{buffer: Buffer, width: number, height: number}|null} Imagen renderizada o null en fallo.
 */
export function svgToPng(svg, width = CHART_RASTER_WIDTH) {
  if (!svg) return null;
  const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const ratio = viewBox ? Number(viewBox[2]) / Number(viewBox[1]) : 0.36;
  const height = Math.round(width * ratio);
  const scalable = svg
    .replace('width="100%"', `width="${width}" height="${height}"`)
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif" ');
  try {
    const resvg = new Resvg(scalable, {
      fitTo: { mode: 'width', value: width },
      font: { loadSystemFonts: true },
    });
    const rendered = resvg.render();
    return { buffer: rendered.asPng(), width: rendered.width, height: rendered.height };
  } catch (error) {
    console.warn('[chartImages] No se pudo rasterizar un gráfico:', error.message);
    return null;
  }
}

/**
 * Genera el mapa de imágenes rasterizadas correspondientes a todos los gráficos del informe.
 * @param {object} model - Modelo del informe construido por buildReportModel.
 * @returns {Record<string, {buffer: Buffer, width: number, height: number}>} Mapa de buffers indexados.
 */
export function buildReportChartImages(model) {
  const images = {};
  const add = (key, svg) => {
    if (!images[key] && svg) images[key] = svgToPng(svg);
  };
  (model?.conclusion?.cards ?? []).forEach((card) => {
    if (card.chart) add('shares', renderSharesChartSvg(card.chart));
    if (card.debtMaturityChart) add('debtMaturity', renderDebtMaturitySvg(card.debtMaturityChart));
    if (card.debtHistoryChart) add('debtHistory', renderDebtHistorySvg(card.debtHistoryChart));
    if (card.dividendChart) add('dividend', renderDividendSvg(card.dividendChart));
  });
  return images;
}
