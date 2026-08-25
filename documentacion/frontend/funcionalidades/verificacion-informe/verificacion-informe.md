# Funcionalidad: Análisis del informe (10-Q / 10-K) — Frontend

> Capa: **frontend** · Fecha: 2026-08-12 (base) · Actualizado: 2026-08-14 (pipeline completo + botón desde SEC) · Estado: **implementado y probado**

---

## 1. Objetivo

Ofrecer la interfaz del **análisis con IA** de un informe 10-Q / 10-K: subir un PDF (arrastrar y soltar), ver el **pipeline de 3 agentes** en tiempo real con cronómetro, ver el **informe estructurado** (2 horizontes, 3 bloques), **descargar el PDF** y guardar el análisis en el histórico. También ejecuta el análisis **desde la página de empresa** (botón "Analizar con IA" de un filing), navegando a Inicio con `/?analizar=TICKER&accession=...`.

## 2. Alcance

**Incluido:**
- Dropzone de PDF (arrastrar/soltar, click, validación PDF ≤ 25 MB, preview con quitar).
- Panel de procesamiento: estados de los 3 agentes (En espera → Procesando → Completado/Error), barra de progreso y **cronómetro mm:ss** con avisos progresivos (45 s: "suele tardar entre 1 y 4 minutos"; 240 s si sigue).
- Resultado: informe real con bloques Ventas / Cash Flow / Asignación de Capital, botón "Descargar PDF del análisis" y "Analizar otro informe".
- Errores: caja roja con mensaje + código del servidor y botón Reintentar.
- Ejecución automática desde `/?analizar=TICKER&accession=...` (botón de Empresa), con limpieza de la URL (`history.replaceState`) y scroll a la sección.
- Guardado automático con sesión: toast "Análisis guardado en tu histórico".

**Excluido:**
- Vista de detalle del informe en web (se abre el PDF).
- Análisis multi-periodo (Fase 4).

## 3. Flujo

```
Usuario → sube PDF (dropzone) → POST /api/upload
  → panel de agentes: Origen → Sector → Análisis (estados en vivo + cronómetro)
  → 200 → resultado: informe (report-body) + botón descargar PDF
  → 422 → caja roja con { error, code } + Reintentar (vuelve a subir el mismo archivo)
  → 500 (sin key / timeout IA) → caja roja con el mensaje del servidor

Desde Empresa ("Analizar con IA" de un filing):
  → navega a /?analizar=TICKER&accession=ACCESSION
  → app.js consume los parámetros (limpia la URL), hace scroll a la sección de análisis
  → ejecuta POST /api/screener/company/:ticker/filings/:accession/analyze
     con la misma UI de agentes; "Reintentar" re-ejecuta el mismo filing (pendingFiling)
```

## 4. Estados de los agentes

| Estado | Visual |
|---|---|
| En espera | Círculo gris |
| Procesando | Spinner/animación |
| Completado | ✓ verde |
| Error | ✕ rojo (solo el agente que falló; los anteriores quedan Completado — fix 2026-08-14) |

## 5. Componentes de la sección (`#nuevo`)

| Elemento | Función |
|---|---|
| Dropzone | `#upload-dropzone`: arrastrar/soltar, click, validación, preview + quitar |
| Panel de proceso | `#processing-panel`: título dinámico ("Leyendo tu informe..."/"Verificando..."), cronómetro `#processing-time`, estados de agentes, barra de progreso |
| Resultado | `#result-preview`: `#report-body` con los 3 bloques, `#report-download` (descarga con nombre `<ticker>-analisis-cifra.pdf`), `#new-analysis` |
| Error | Caja roja con mensaje + Reintentar |
| Metodología | Panel "Qué ocurre después" (mini-pipeline de 3 pasos) |

## 6. Archivos del frontend implicados

| Archivo | Función |
|---|---|
| `public/index.html` | Sección `#nuevo` (dropzone, procesamiento, resultado, metodología) y carga de scripts. |
| `public/app.js` | `uploadFile`, estados de agentes, cronómetro, avisos, render del informe, descarga del PDF, parámetros `?analizar=`, `pendingFiling`, refresco del histórico al guardar. |
| `public/empresa.js` | Botón "Analizar con IA" por filing → `/?analizar=TICKER&accession=...`. |
| `public/styles.css` | Dropzone, estados, resultado, caja de error, avisos. |

## 7. Casos límite

| Caso | Comportamiento |
|---|---|
| Archivo no PDF o > 25 MB | Error cliente antes de subir |
| Servidor responde 422 (NOT_USA, NOT_DEFENSIVE_CONSUMER...) | Caja roja con el mensaje claro + Reintentar |
| Sin `DEEPSEEK_API_KEY` / timeout IA | Mensaje del servidor (500) en la caja de error |
| Análisis en curso + servidor --watch reinicia | Se corta la petición (nota de desarrollo: no editar archivos durante un análisis con `npm run dev`) |
| Con sesión | Toast "Análisis guardado en tu histórico" y recarga del histórico |
| Sin sesión | Resultado visible; aviso de iniciar sesión para guardar (`saved: false`) |

## 8. Pruebas realizadas

- Pipeline completo end-to-end (KHC 10-Q real): 200 ~21 s, informe con 2 horizontes y 3 bloques, PDF descargable.
- Botón "Analizar con IA" (TAP): navega a `/`, consume parámetros, ejecuta el pipeline (200 en 22,8 s con DeepSeek), guardado con sesión.
- Cronómetro mm:ss correcto (antes `00:99` se rompía); avisos a 45 s y 240 s.
- Fallo del analista: origen y sector quedan "Completado" (fix).

## 9. Relación con otros módulos

- **Backend**: `documentacion/backend/funcionalidades/verificacion-informe/` (pipeline y endpoints).
- **Histórico**: al completar con sesión se guarda y se refresca "Mis análisis".
- **Empresa/Screener**: botón "Analizar con IA" en los filings.

## 10. Pendientes

- Vista de detalle del análisis dentro de la web.
- Reintentos automáticos ante fallos transitorios del modelo (hoy reintenta una vez vía `chatJson`; el UI ofrece Reintentar manual).
