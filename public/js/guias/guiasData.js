/**
 * @fileoverview Datos estáticos de la sección «Guías»: apartados, sub-pestañas y
 * metadatos de navegación. Fuente única compartida por la interfaz y el SSR.
 * @module guiasData
 */

const APARTADOS = [
    {
      id: 'aviso',
      nombre: 'Aviso y Proyecto',
      badge: 'Disclaimer & Beta',
      iconoSvg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      descripcion: 'Aviso importante sobre el proyecto Cifra, herramientas disponibles, funcionamiento del análisis con IA y estado actual de desarrollo.'
    },
    {
      id: 'datos-financieros',
      nombre: 'Datos Financieros',
      badge: 'Estados y Métricas',
      iconoSvg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
      descripcion: 'Guías de consulta sobre los tres estados contables fundamentales: cuenta de resultados, balance de situación y estado de flujos de caja.'
    },
    {
      id: 'cartera',
      nombre: 'Cartera',
      badge: 'Gestión y Rentabilidad',
      oculto: true,
      iconoSvg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
      descripcion: 'Guías sobre gestión de cartera, registro de transacciones, diversificación y seguimiento de rentabilidad.',
      emptyTitulo: 'Apartado de Cartera',
      emptyTexto: 'Este apartado está preparado para incorporar las guías sobre el funcionamiento de la cartera, asignación de activos, registro de operaciones y cálculo de rendimientos. El contenido se añadirá próximamente.'
    },
    {
      id: 'analisis-ia',
      nombre: 'Análisis con IA',
      badge: 'Metodología e IA',
      iconoSvg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
      descripcion: 'Guías sobre el motor de análisis de Cifra, interpretación de informes SEC con IA y marcos de análisis por sectores.',
      emptyTitulo: 'Apartado de Análisis con IA',
      emptyTexto: 'Este apartado está preparado para incorporar las guías sobre el sistema multi-agente de Cifra, lectura estructurada de informes 10-Q y 10-K y análisis adaptado a cada sector. El contenido se añadirá próximamente.'
    }
  ];

  const APARTADOS_VISIBLES = APARTADOS.filter((apartado) => !apartado.oculto);

  const DATOS_FINANCIEROS_TABS = [
    {
      id: 'cuenta-resultados',
      nombre: 'Cuenta de Resultados',
      badge: 'Income Statement (P&G)',
      iconoSvg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>'
    },
    {
      id: 'balance',
      nombre: 'Balance',
      badge: 'Balance Sheet',
      iconoSvg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>'
    },
    {
      id: 'cash-flows',
      nombre: 'Cash Flows',
      badge: 'Cash Flow Statement',
      iconoSvg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>'
    }
  ];

  const ANALISIS_IA_TABS = [
    {
      id: 'trimestral',
      nombre: 'Informe Trimestral (10-Q)',
      badge: 'Form 10-Q · Operativa & Dos Horizontes',
      iconoSvg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
    },
    {
      id: 'anual',
      nombre: 'Informe Anual (10-K)',
      badge: 'Form 10-K · Auditoría & Proyección Plurianual',
      iconoSvg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
    }
  ];
export {
  APARTADOS,
  APARTADOS_VISIBLES,
  DATOS_FINANCIEROS_TABS,
  ANALISIS_IA_TABS,
};
