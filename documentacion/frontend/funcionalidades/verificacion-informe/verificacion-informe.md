# Funcionalidad: Verificación del informe (10-Q / 10-K de EE. UU.) — Frontend

> Capa: **frontend** · Fecha: 2026-08-12 · Estado: **implementado y conectado a la API real**

---

## 1. Objetivo

Que el usuario suba un PDF desde la web y, al pulsar "Analizar informe", el documento se verifique de verdad contra la API (`POST /api/upload`): si es un 10-Q/10-K de EE. UU. **de consumo defensivo** se confirma el tipo y el sector; si no, se muestra el error del servidor en pantalla en el agente correspondiente. Sustituye a la demo simulada del pipeline.

## 2. Alcance

**Incluido:**
- Dropzone de subida (clic, teclado, arrastrar y soltar), validación cliente (solo PDF, ≤ 25 MB) y preview del archivo con botón de quitar.
- Llamada real a `POST /api/upload` con `FormData`.
- Panel de análisis en curso con estados por agente: En espera → Procesando → Completado / Error.
- Error del servidor mostrado en pantalla (caja roja) + botón "Reintentar", en la fila del agente que falló (origen o sector).
- Éxito: "Documento verificado: 10-Q · Sector defensivo", toast y botón "Analizar otro informe".
- Contador de tiempo mientras el servidor responde.

**Excluido (pendiente):**
- Estado del agente analista (el pipeline real solo ejecuta origin y sector por ahora).
- Resultado final del análisis (informe del analista).
- Guardado del análisis en el histórico real de la web.

## 3. Flujo de la interfaz

```
Usuario → selecciona/arrastra PDF
  → validación cliente: tipo PDF y ≤ 25 MB          [fallo → toast]
  → preview con nombre, tamaño y botón "quitar"

Usuario → pulsa "Analizar informe"
  → uploadForm.hidden = true, processingPanel visible, origin = Procesando
  → fetch POST /api/upload (FormData con 'file')
      → 200 { ok, origin, formType, sector }
          → origin = Completado ✓, sector = Completado ✓
          → título "Documento verificado: 10-Q · Sector defensivo"
          → toast "Documento identificado como 10-Q de consumo defensivo..."
          → botón "Analizar otro informe" (limpia la selección)
      → error 422 { error, code }
          → code NOT_DEFENSIVE_CONSUMER
              → origin ✓ + sector ✕
              → título "La empresa no es de consumo defensivo"
              → caja roja con el mensaje del servidor + "Reintentar"
          → otros códigos (origin)
              → origin ✕
              → título "No se pudo verificar el documento" + caja roja + "Reintentar"
      → red caída / servidor apagado
          → "No se pudo conectar con el servidor. Comprueba que esté en marcha."
```

## 4. Estados del panel de análisis

| Elemento | En curso | Éxito | Error origen | Error sector |
|---|---|---|---|---|
| `#processing-title` | "Verificando el documento..." | "Documento verificado: 10-Q · Sector defensivo" | "No se pudo verificar el documento" | "La empresa no es de consumo defensivo" |
| Agente origin | Procesando (activo, naranja) | Completado (✓ verde) | Error (✕ rojo) | Completado (✓ verde) |
| Agente sector | En espera | Completado (✓ verde) | En espera | Error (✕ rojo) |
| Agente analista | En espera | En espera | En espera | En espera |
| `#analysis-error` | oculto | oculto | visible (caja roja) | visible (caja roja) |
| `#retry-analysis` | oculto | "Analizar otro informe" | "Reintentar" | "Reintentar" |
| `#progress-bar` | 20% (pulso) | 60% | 100% | 100% |
| `#processing-time` | contador | parado | parado | parado |

## 5. Archivos del frontend implicados

| Archivo | Función |
|---|---|
| `public/index.html` | Dropzone `#dropzone` + formulario `#upload-form` + botón `#analyze-button`; panel `#processing-panel` (3 agentes, `#progress-bar`, `#analysis-error`, `#retry-analysis`, `#processing-note`); `#result-preview` (demo, sin usar por ahora). |
| `public/app.js` | `setFile`/`clearFile` (validación + preview), `setAgentState` (active/done/error), `runRealAnalysis()` (fetch a `/api/upload`), `showAnalysisError()`, listeners del form, retry y menús. |
| `public/styles.css` | Estados `.agent-row.active/.done/.error`, `.analysis-error` (caja roja), `.retry-button`, `.progress-track`. |

## 6. Comunicación con el backend

| Llamada | Método | Uso |
|---|---|---|
| `/api/upload` | POST | `FormData` con el PDF (campo `file`). Respuesta JSON. |

- La respuesta de error se lee siempre con `response.json().catch(() => ({}))` y se muestra `data.error`; si no hay mensaje, texto genérico.
- El archivo se envía en memoria (el backend no guarda el PDF en disco aún).

## 7. Validaciones cliente

| Caso | Comportamiento |
|---|---|
| Archivo no PDF | Toast "Selecciona un archivo PDF para continuar." (no se acepta) |
| Archivo > 25 MB | Toast "El archivo supera el límite de 25 MB." (no se acepta) |
| Pulsar "Analizar" sin archivo | No hace nada (botón deshabilitado) |

## 8. Errores y casos límite

| Caso | Comportamiento |
|---|---|
| Servidor devuelve 422 `NOT_DEFENSIVE_CONSUMER` | Origin ✓ y sector ✕ (rojo); caja roja con el mensaje exacto del servidor + "Reintentar" |
| Servidor devuelve 422 de origen (no financiero / no EE. UU. / no 10-Q/10-K) | Origin ✕; caja roja con el mensaje exacto + "Reintentar" |
| Servidor apagado o red caída | "No se pudo conectar con el servidor. Comprueba que esté en marcha." |
| Error 500 (p. ej. falta API key) | Se muestra el mensaje del servidor ("Falta DEEPSEEK_API_KEY...") |
| Éxito | Panel de verificación completada (origen y sector ✓); el usuario pulsa "Analizar otro informe" para subir otro PDF |

## 9. Responsive

- El panel de procesamiento usa los mismos contenedores que el resto del dashboard: en móvil los paneles se apilan a una columna (regla `@media (max-width: 900px)` existente).
- El botón "Analizar informe" mantiene el tamaño táctil en pantallas pequeñas (comportamiento heredado de `.primary-button`).

## 10. Pruebas realizadas

- Verificación visual del flujo de subida (validación, preview, quitar archivo).
- Llamada real probada vía curl equivalente al frontend: 10-Q defensivo → 200, 10-Q tech → 422 `NOT_DEFENSIVE_CONSUMER`, PDF normal → 422 `NOT_FINANCIAL`.
- Estados de agente verificados con el backend en marcha (Procesando → Completado y Procesando → Error en origen y en sector).
- **Eliminado**: la demo simulada (`runDemoAnalysis`) que completaba los 3 agentes en falso; el aviso "Vista de demostración" se sustituyó por "El documento se verifica automáticamente antes de continuar."

## 11. Relación con otros módulos

- **Backend**: consume `POST /api/upload` (ver `documentacion/backend/funcionalidades/verificacion-informe/`).
- **Auth**: el endpoint aún no requiere sesión; cuando se proteja con `requireAuth`, la cookie se enviará sola (mismo origen).
- **Histórico futuro**: el resultado verificado (origin + formType) podrá mostrarse en la tabla de "Últimos análisis" cuando exista `GET /api/analyses`.

## 12. Pendientes

- Mostrar el resultado final del analista (sector + informe) cuando el pipeline los implemente.
- Histórico real del usuario en la tabla de análisis.
- Indicador visual del modo (simulado vs API real) si se retoma `AI_PROVIDER=mock`.
