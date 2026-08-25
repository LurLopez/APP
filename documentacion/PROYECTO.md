# Proyecto: Analizador de Resultados Financieros (10-Q / 10-K)

> Idioma de la interfaz: **Español** · Este es el resumen inyectado en el contexto de todos los agentes. La versión completa y viva está en `documentacion/PROYECTO-detalle.md`: léela cuando necesites el detalle.

## Qué es

Web que analiza con IA informes financieros de EE. UU. (10-Q trimestral, 10-K anual) y entrega un análisis estructurado en segundos. La IA criba y ahorra tiempo; el análisis profundo y el juicio final son del usuario.

## Alcance de la beta

- Solo **EE. UU.** · Solo **10-Q y 10-K** · Solo sector **consumo defensivo**.
- Lo que quede fuera se detecta y rechaza con error claro ("Este informe no es de una empresa de EE. UU." / "Este informe no corresponde al sector de consumo defensivo").

## Proceso de análisis (agentes secuenciales)

1. **Verificador de origen** — ¿empresa de EE. UU.? No → error.
2. **Verificador de sector** — ¿consumo defensivo? No → error.
3. **Analista principal** — análisis financiero e informe final (2 fases: extracción + estructuración) + PDF generado.

**Regla fundamental:** las dos formas de llegar al análisis (subida manual de PDF o buscador por ticker/filing de la SEC) deben ejecutar exactamente el mismo proceso y dar el mismo resultado. ✅ Verificada.

## Estado del roadmap (2026-08-15)

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Subida manual de PDF → análisis (beta) | ✅ Pipeline completo funcionando (3 agentes + informe + PDF + guardado); modelo activo DeepSeek directo |
| 2 | Buscador de empresas (ticker) + histórico de filings + ver PDF + analizar | ✅ Buscador, cribador (sin huecos), perfil, gráfico, filings con vista previa/descarga y botón "Analizar" implementados |
| 3 | Registro / inicio de sesión | ✅ Implementado con verificación por correo y recuperación de contraseña; planes pendientes (Fase 5) |
| 4 | Análisis completo de empresa (multi-periodo) | ⏳ Pendiente |
| 5 | Suscripciones y planes (modelos según plan, límites) | ⏳ Pendiente (campo `plan` ya existe) |
| 6 | Nuevos países y sectores | ⏳ Pendiente |

**Extras ya implementados:** histórico de análisis por usuario con filtros · listas de seguimiento multi-lista (sustituyen a los favoritos) · cartera de inversión con FIFO, dividendos estimados y gráficos de distribución.

## Arquitectura (en marcha)

- **Stack decidido**: Node.js + Express 5 + PostgreSQL 16 + frontend puro (HTML/CSS/JS; migrable a React). Sesión JWT en cookie httpOnly; bcryptjs.
- **Capa de abstracción de modelos IA**: los agentes solo hablan con `modelProvider.chat/chatJson`; proveedores `deepseek` (activo), `opencode-go` y `mock`; `AI_PROVIDER` en `.env` permite cambiar sin tocar agentes.
- **Sistema de agentes extensible**: cada agente es independiente y registrable (`agentRegistry`); reglas por sector en `src/agents/prompts/`.
- **Histórico de análisis**: guardado por usuario en `analyses` con filtros (`GET /api/analyses`).
- **Roadmap**: F1 ✅ → F2 ✅ → F3 ✅ → F4 (multi-periodo) → F5 (planes) → F6 (más países/sectores).

## Decisiones tomadas y pendientes

- ✅ **Stack**: Node.js + Express + PostgreSQL + frontend puro (ver `ARQUITECTURA.md`).
- ✅ **Modelo IA en uso**: **DeepSeek directo** (`AI_PROVIDER=deepseek`, 22–23 s por análisis y fiable; OpenCode Go probado pero intermitente). Decisión a medio plazo por confirmar.
- ✅ **Formato del informe**: 2 horizontes + bloques Ventas / Cash Flow / Asignación de Capital según `src/agents/prompts/consumo-defensivo.md` (derivado del informe de referencia del usuario); pendiente refinar con más referencias.
- 🔴 **Despliegue**: decidir cuando toque publicar (VPS vs PaaS).

## Interacción con el usuario (importante)

El desarrollador está aprendiendo inglés: cuando escriba un **prompt en inglés**, la respuesta debe empezar con una corrección breve (frase original, versión corregida, explicación de los errores en español; si está bien, decirlo). Los prompts en español no se corrigen.

## Registro diario de cambios (obligatorio, automático)

Después de cada cambio considerable, **el agente que lo haya realizado debe registrarlo automáticamente** en el diario; no depende del agente de documentación ni hay que pedirlo.

- Considerables: nueva funcionalidad, corrección de bug, cambio de arquitectura o estructura, cambio de esquema de BD, nuevo endpoint/integración, cambio de flujo de producto, decisión técnica o de producto. No registrar cambios cosméticos.
- Ruta: `documentacion/diario/YYYY/MM/YYYY-MM-DD.md` (fecha de la petición o la actual). Si el archivo del día ya existe, añade la entrada al final sin borrar ni reescribir las anteriores.
- Formato de cada entrada:

```markdown
## HH:MM — Resumen: <título breve>

Se solicitó <descripción>.

### Resultado

<resumen de lo realizado, decidido o pendiente>
```
