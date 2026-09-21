# Plan del sector Cíclicas (`cyclical`)

> Versión: 1.0 · Fecha: 2026-09-20 · Estado: 📋 **Planificado** — pendiente de cerrar la lista de subsectores admitidos antes de implementar.

Nuevo cuarto sector para empresas cíclicas de industrias hoy rechazadas (químicas, materias primas y minería, metales/acero, papel y packaging, transporte, ETTs/staffing, maquinaria…). El análisis se centra en los cuatro ejes comunes a todas ellas: **deuda, sostenibilidad del dividendo, posición en el ciclo y márgenes**.

---

## 1. Alcance

| Formulario | Qué se hace |
|---|---|
| 10-Q | Mismo proceso y bloques que el resto de sectores (Ventas / Cash Flow / Asignación de capital). Es seguimiento. Única diferencia: política de ajustes sin intangibles (ver §3). |
| 10-K | Primera parte idéntica al trimestral. Segunda parte: bloques anuales actuales (Deuda, Dividendos, Recompras, Outlook, Directiva) **+ nueva sección de posición en el ciclo y valoración normalizada** (ver §5). |

---

## 2. Decisiones de diseño (cerradas)

1. **Sin agente nuevo.** El `sectorAgent` añade el cuarto valor `cyclical` (ticker conocido → SIC → IA). Es el mismo filtro de siempre, no un pre-clasificador aparte.
2. **Precedencia:** los sectores ya curados (consumo defensivo, tecnología, consumo discrecional) mandan; cíclicas recoge lo que hoy se rechaza. Así vivienda, autopartes y concesionarios siguen en discrecional y no hay empresas clasificables en dos sitios.
3. **Datos deterministas en JS; la IA solo interpreta.** Coherente con las suites de paridad existentes.
4. **Cotización en vivo, beneficio normalizado guardado.** El cálculo normalizado se almacena con el análisis; la cotización se consulta al visualizar, de modo que el análisis no caduca por precio.
5. **La sección anual también sale en el PDF exportado.**
6. **Lenguaje:** nada de predicciones («puede doblar»); siempre condicional («si los márgenes vuelven a X, el valor sería Y»).

---

## 3. Política contable del sector (trimestral y anual)

- **Sin ajuste de intangibles.** La amortización de activos productivos es coste real y no se suma de vuelta (a diferencia de defensivo/discrecional).
- **Deterioro de goodwill/marcas:** no se pone a 0; se mantiene en la tabla con nota, porque en cíclicas es informativo (señal de haber sobrepagado en el pico).
- El resto de reglas transversales se heredan del Nivel 1 (`knowledge/general.md` y `knowledge/anual/general.md`): WC con peso agregado histórico, impuestos normalizados al 23 %, etc.
- Implementación: política propia en `src/agents/analyst/sectorPolicy.js` y reglas en `src/agents/knowledge/ciclicas/sector.md` (Nivel 2, versión 1). Reglas anuales específicas, si hacen falta, en `src/agents/knowledge/anual/ciclicas/sector.md`.

---

## 4. Clasificación

- `KNOWN_CYCLICAL_TICKERS` + rangos SIC propuestos (a confirmar): química 2800–2899, minería y metales 1000–1099 y 3300–3399, papel/packaging 2600–2699, transporte 4000–4799, maquinaria 3500–3599, ETTs/staffing 7361/7363.
- Prompt del clasificador IA reescrito con el alcance exacto y exigencia de evidencia (si no está claro, `unsupported`).
- Etiquetas de perfil (`companyProfileData.js`), proveedor `mock` y traducción SEO.
- **Pendiente de decidir:** (a) lista definitiva de subsectores admitidos; (b) si entran las automotrices completas (hoy rechazadas) y la energía; (c) precedencia definitiva con consumo discrecional.

---

## 5. Sección anual: posición en el ciclo y valoración normalizada

1. **Cotización vs media móvil** (simple: por debajo / por encima). Opcional futuro: mediana de 10 años como segunda línea; los percentiles de precio quedan descartados por ahora (nunca irían solos, siempre junto al valor normalizado y la posición de ciclo).
2. **Gráfico de márgenes:** margen operativo **ajustado** de los últimos 10 años con la **mediana** dibujada como línea de referencia.
3. **Tabla exclusiva de beneficio normalizado** (determinista):
   - Ingresos actuales (los del informe).
   - Mediana del margen operativo ajustado de 10 años.
   - EBIT normalizado.
   - − intereses de la deuda **actual** (la media histórica de márgenes no refleja la deuda de hoy).
   - Impuestos normalizados (23 %, consistente con el resto del sistema).
   - Beneficio neto y EPS normalizados.
   - Comparación con la cotización viva y **rango de valor condicional** (múltiplo por decidir; propuesta: 12–15× o P/E medio histórico de la empresa).
4. **Comprobaciones de la tesis** (deterministas):
   - **Reversión:** media del margen de los 5 primeros años vs los 5 últimos (si baja de forma sostenida, es declive estructural, no ciclo).
   - **Supervivencia:** cobertura de intereses y dividendo pagable con el beneficio normalizado.
   - **Dilución:** acciones actuales vs 10 años atrás (si hay muchas más, el precio antiguo no vuelve aunque el beneficio se recupere).
5. **Alertas:**
   - **Margen operativo TTM < 0 %** → alerta; es antes de intereses (pierde dinero solo operando). Leer como prueba de supervivencia: caja/liquidez disponible y vencimientos de deuda a 12–24 meses. Margen negativo + vencimientos próximos = alerta roja; margen negativo con caja holgada y deuda lejana = valle normal del ciclo.
   - **Margen por debajo de su mediana histórica** → aviso de posición de ciclo (sale de la propia tabla).
6. **Histórico mínimo:** propuesta 7 años; por debajo, la sección se oculta con nota «histórico insuficiente». (Pendiente de confirmar.)

---

## 6. Ficheros afectados (previsto)

| Pieza | Fichero |
|---|---|
| Clasificación | `src/agents/sectorAgent.js` |
| Política de ajustes | `src/agents/analyst/sectorPolicy.js` |
| Versionado | `src/agents/versionRegistry.js` |
| Reglas de sector | `src/agents/knowledge/ciclicas/sector.md` (+ `anual/ciclicas/sector.md`) |
| Extracción | `src/agents/analyst/analystExtractionPrompt.js` / `analystExtractionSchema.js` (si la sección anual necesita hechos nuevos) |
| Conclusión anual | `src/agents/analyst/annualConclusionProcessor.js`, `annualConclusionSections.js`, `analystRunSteps.js` |
| Mercado | `src/services/market.service.js`, `src/services/edgar/valuationSeries.core.js` (reutilizar) |
| Perfil/SEO/mock | `src/services/edgar/companyProfileData.js`, `public/js/empresa/empresaFormatting.js`, `src/services/ai/providers/mock.provider.js` |
| Exportación | `src/services/pdf.service.js` y exportadores HTML/DOCX/ODT |
| i18n | `public/locales/en.json`, `_sources.json`, `DICTIONARY_VERSION` |
| Pregeneración | `scripts/analyze-consumer.core.js` / `worker.js` → `npm run analyze:cyclical` |
| Portada/guías | `public/index.html`, `public/empresa.html`, `guiasAnalisisIaContent.js` |

---

## 7. Fases

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Decisiones de producto: subsectores admitidos, precedencia con discrecional, histórico mínimo | ⏳ Pendiente |
| 1 | Clasificación (`sectorAgent`, tickers, SIC, prompt, mensaje de rechazo, versionado, mock/perfil/SEO) | ⏳ Pendiente |
| 2 | Reglas Nivel 2 + política sectorial sin intangibles + pruebas de paridad | ⏳ Pendiente |
| 3 | Sección anual determinista (media móvil, gráfico de márgenes, tabla normalizada, comprobaciones, alertas) + PDF + i18n | ⏳ Pendiente |
| 4 | Worker `analyze:cyclical`, pregeneración, portada/guías/SEO y textos de cobertura | ⏳ Pendiente |
| 5 | Nivel 3 por subsector y ejemplos (como en consumo discrecional) | ⏳ Pendiente |

---

## 8. Pruebas previstas

- `tests/unit/sectorCyclical.test.js`: tickers admitidos y excluidos, SIC, versión, reglas, agente, política, perfil y mock.
- Ampliar `tests/unit/sectorCalculationParity.test.js`: cíclicas comparte motor con defensivo/discrecional salvo la política de intangibles; verificar que no diverge por accidente.
- Pruebas de la sección anual: margen mediano, beneficio normalizado (incluida la resta de intereses actuales), alerta de margen < 0, dilución y caso de histórico insuficiente.

---

## 9. Riesgos y avisos

- **Cíclicas es heterogéneo** (ETT = ciclo laboral; química = spreads; minería = precio del commodity): el Nivel 2 cubre los ejes comunes; el detalle por subsector es Nivel 3, en fase posterior.
- **Normalizar con ingresos actuales** puede sobreestimar si están en pico (típico en materias primas): mostrar también la posición de ingresos/márgenes respecto a su rango de 10 años.
- **Empresas jóvenes:** sin 7–10 años de histórico la sección no se muestra.
- **Legal:** la tabla se redacta como referencia de valoración condicional, nunca como precio objetivo ni recomendación.
